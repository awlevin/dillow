// Renders the README art from the frames capture.mjs wrote:
//
//   node scripts/readme-art/render.mjs <frames dir> <out dir>
//
// Writes screenshots.png (2560x1440), banner.png (2560x800) and
// social-preview.png (1280x640, for the GitHub repo settings).
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { launch, sleep, watchdog } from "./chrome.mjs";

watchdog(3 * 60_000);

const [frames, out] = process.argv.slice(2).map((p) => p && path.resolve(p));
if (!frames || !out) throw new Error("Usage: node scripts/readme-art/render.mjs <frames dir> <out dir>");
const compose = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), "compose.html"));

const page = await launch(["--allow-file-access-from-files"]);
const sizes = {
  strip: [2560, 1440, "screenshots"],
  banner: [2560, 800, "banner"],
  social: [1280, 640, "social-preview"],
};
for (const [kind, [w, h, name]] of Object.entries(sizes)) {
  await page.viewport(w, h);
  const url = new URL(compose);
  url.search = new URLSearchParams({ kind, frames }).toString();
  await page.goto(url.href);
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await sleep(500);
  await page.screenshot(path.join(out, `${name}.png`));
  console.log("wrote", name);
}
await page.close();
