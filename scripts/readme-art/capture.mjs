// Captures the phone screenshots behind the README art (docs/*.png).
//
// The art shows a REAL home, so it must never leak an answer:
//   - Use a home that was already played as a past daily, and that is not
//     today's home or one of the next weeks' homes. The game repeats homes,
//     so pick the past home whose next slate appearance is furthest away.
//   - Show only photos, city and basic facts. The reveal's street address is
//     removed from the page before the capture; listing descriptions, agent
//     names and links stay out of frame.
//
// How to run it (maintainer only, Node 22+, needs the real dataset):
//
//   vercel env pull .env.local && npm run data:pull
//   mv .env.local /somewhere/else   # no Redis: nothing touches production
//   npm run build
//   FAKE_NOW=<past game day, e.g. 2026-07-20T16:00:00Z> \
//     NODE_OPTIONS="--import ./scripts/readme-art/fake-clock.mjs" \
//     npx next start -p 47811
//   node scripts/readme-art/capture.mjs --slot 1 --warmup <guesses> \
//     --guesses <g1,g2,g3,g4> --photo 5 --out /tmp/frames
//   node scripts/readme-art/render.mjs /tmp/frames docs
//
// Options:
//   --base     the local server (default http://localhost:47811)
//   --slot     which of the day's homes to show (0-based, default 0)
//   --warmup   comma-separated guesses that finish every home before --slot
//   --guesses  comma-separated guesses on the shown home; the last one wins
//   --mid      how many guesses the middle frame shows (default 3)
//   --photo    gallery index the middle frame shows (default 0)
//   --out      where to write the frames (default .)
//
// Writes phone-start.png, phone-mid.png, phone-mid-exterior.png (the middle
// frame on the first photo, for the hero art) and phone-done.png.
import { parseArgs } from "node:util";
import { deadline, launch, sleep, watchdog } from "./chrome.mjs";

watchdog(10 * 60_000);

const { values: opts } = parseArgs({
  options: {
    base: { type: "string", default: "http://localhost:47811" },
    slot: { type: "string", default: "0" },
    warmup: { type: "string", default: "" },
    guesses: { type: "string" },
    mid: { type: "string", default: "3" },
    photo: { type: "string", default: "0" },
    out: { type: "string", default: "." },
  },
});
const nums = (s) => (s ? s.split(",").map((x) => Number(x.trim())) : []);
const BASE = opts.base;
const SLOT = Number(opts.slot);
const WARMUP = nums(opts.warmup);
const GUESSES = nums(opts.guesses);
const MID = Number(opts.mid);
const PHOTO = Number(opts.photo);
if (GUESSES.length <= MID) throw new Error("--guesses needs more guesses than --mid.");

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());

// Refuse to run against anything that could write to production state or
// show a current home.
const getJson = async (url) => (await fetch(url, { signal: AbortSignal.timeout(10_000) })).json();
const board = await getJson(`${BASE}/api/leaderboard?propertyId=x`);
if (board.enabled !== false) throw new Error("The server has Redis. Run it without .env.local.");
const daily = await getJson(`${BASE}/api/daily`);
if (!(daily.date < today)) throw new Error(`The server is on ${daily.date}, not a past day. Set FAKE_NOW.`);
const target = daily.homes[SLOT]?.clue;
if (!target) throw new Error(`No home in slot ${SLOT}.`);
const cityState = `${target.city}, ${target.state}`;
console.log(`game day ${daily.date}, slot ${SLOT}: a home in ${cityState}`);

const clickButton = (page, re) =>
  page.evaluate((src) => {
    const re = new RegExp(src, "i");
    const b = [...document.querySelectorAll("button")].find((x) => re.test(x.textContent.trim()));
    b?.click();
    return !!b;
  }, re.source);

// Focuses and selects the price box; false while the slider is showing.
const focusPriceBox = (page) =>
  page.evaluate(() => {
    const input = document.querySelector('input[placeholder="Enter a price"]');
    if (!input) return false;
    input.focus();
    input.select();
    return true;
  });

const countResults = () => (document.body.innerText.match(/Too (high|low)|Nailed it/g) ?? []).length;

// Wait (bounded) until every photo on screen has decoded.
async function waitForPhotos(page) {
  for (let i = 0; i < 100; i++) {
    const pending = await page.evaluate(
      () =>
        [...document.images].filter((img) => {
          const r = img.getBoundingClientRect();
          const onScreen = r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
          return onScreen && !(img.complete && img.naturalWidth > 0);
        }).length,
    );
    if (pending === 0) break;
    await sleep(100);
  }
  await sleep(800);
}

async function guess(page, value) {
  const before = await page.evaluate(countResults);
  if (!(await focusPriceBox(page))) {
    await clickButton(page, /type guess/);
    await sleep(400);
    if (!(await focusPriceBox(page))) throw new Error("No price box.");
  }
  await page.type(String(value));
  await page.pressEnter();
  for (let i = 0; (await page.evaluate(countResults)) === before; i++) {
    if (i === 50) throw new Error(`The guess ${value} got no result.`);
    await sleep(100);
  }
  await sleep(1500); // let confetti and the count-up settle
}

// Viewport-only: a fullPage capture resizes the viewport, which knocks the
// looping photo carousel onto its trailing clone.
async function shot(page, name) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await sleep(400);
  await waitForPhotos(page);
  await page.screenshot(`${opts.out}/${name}.png`);
  console.log("wrote", name);
}

// Polls fn in the page until it returns true.
async function waitFor(page, fn, what, arg) {
  for (let i = 0; i < 150; i++) {
    if (await page.evaluate(fn, arg)) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${what}.`);
}

// One phone: a fresh browser with a fresh profile (so a new player), on the
// target home, ready to play. Each attempt is capped, and a stuck one is
// thrown away and retried.
const PHONE_LIMIT = 120_000;
async function phone(name, height, act) {
  for (let attempt = 1; ; attempt++) {
    console.log(`${name}: attempt ${attempt}`);
    let page;
    try {
      page = await launch();
      await deadline(play(page, height, act), PHONE_LIMIT, `The ${name} phone`);
      return;
    } catch (err) {
      if (attempt === 3) throw err;
      console.log(`${name}: attempt ${attempt} failed (${err.message}), retrying`);
    } finally {
      await page?.close();
    }
  }
}

async function play(page, height, act) {
  await page.viewport(390, height, 3, true);
  await page.goto(BASE + "/");
  const hasGotIt = () => [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Got it");
  await waitFor(page, hasGotIt, "the How to play dialog");
  // A still frame should not freeze a blinking text caret mid-blink.
  await page.evaluate(() => {
    const style = document.createElement("style");
    style.textContent = "* { caret-color: transparent !important; }";
    document.head.append(style);
  });
  await clickButton(page, /^Got it$/); // first-visit How to play dialog
  await waitFor(page, () => !!document.querySelector('input[placeholder="Enter a price"]'), "the first home");
  await sleep(600);
  let w = 0;
  for (let s = 0; s < SLOT; s++) {
    while (!(await clickButton(page, /^Next home/))) {
      if (w >= WARMUP.length) throw new Error(`--warmup did not finish home ${s}.`);
      await guess(page, WARMUP[w++]);
    }
    await sleep(1200);
  }
  await waitFor(page, (c) => document.body.innerText.includes(` in ${c}`), "the target home", cityState);
  await act(page);
}

await phone("start", 860, (page) => shot(page, "phone-start"));

await phone("mid", 860, async (page) => {
  for (const g of GUESSES.slice(0, MID)) await guess(page, g);
  // Show the typed-entry box, like a player about to type the next guess.
  await clickButton(page, /type guess/);
  await sleep(500);
  await shot(page, "phone-mid-exterior");
  for (let i = 0; i < PHOTO; i++) {
    await page.evaluate(() => document.querySelector('button[aria-label="Next photo"]').click());
    await sleep(450);
  }
  await sleep(2000); // the "n / 28" photo counter fades out 1.2s after a swipe
  await shot(page, "phone-mid");
});

// The solved view is taller than a phone screen; capture it on a tall
// viewport and let compose.html crop it.
await phone("done", 1000, async (page) => {
  for (const g of GUESSES) await guess(page, g);
  await sleep(2500);
  if (!(await page.evaluate(() => /Nailed it in/.test(document.body.innerText)))) {
    throw new Error("The last guess did not win.");
  }
  // No street address in the art. The reveal prints "<address>, <city>, <ST>".
  const removed = await page.evaluate((cityState) => {
    const lines = [...document.querySelectorAll("p")].filter(
      (p) => p.textContent.trim().endsWith(`, ${cityState}`) && /\d/.test(p.textContent),
    );
    lines.forEach((p) => p.remove());
    return lines.length;
  }, cityState);
  if (removed !== 1) throw new Error(`Expected one address line, found ${removed}.`);
  await shot(page, "phone-done");
});
