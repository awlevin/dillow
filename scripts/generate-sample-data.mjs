// Generates the committed SAMPLE dataset — a small, clearly fake pool that lets
// `npm run dev` work from a fresh clone with no credentials:
//
//   src/data/sample/pool.json         made-up homes ("123 Sample St")
//   src/data/sample/enrichment.json   made-up galleries + listing details
//   public/sample/*.svg               flat illustrations standing in for photos
//
// Nothing here is real listing content: addresses, prices, descriptions and
// pictures are all invented, and the coordinates are jittered around city
// centres so the map and Local mode still behave. Deterministic (seeded PRNG),
// so re-running it produces byte-identical output.
//
//   node scripts/generate-sample-data.mjs
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dataDir = path.join(root, "src", "data", "sample");
const imgDir = path.join(root, "public", "sample");

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261104);
const pick = (xs) => xs[Math.floor(rand() * xs.length)];
const between = (lo, hi) => lo + rand() * (hi - lo);
const roundTo = (n, step) => Math.round(n / step) * step;

// ── Illustrations ────────────────────────────────────────────────────────────
// 4:3 to match the photo card. Every image carries a "SAMPLE" tag so a sample
// home can never be mistaken for a real listing in a screenshot. The tag sits
// inset from the corner because the card crops a 4:3 image to a wider frame.
const W = 800;
const H = 600;

function frame(body, bg) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<rect width="${W}" height="${H}" fill="${bg}"/>
${body}
<g transform="translate(40 64)"><rect width="112" height="36" rx="18" fill="#1c1917" fill-opacity="0.72"/><text x="56" y="24" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="16" font-weight="700" letter-spacing="2" fill="#fafaf9">SAMPLE</text></g>
</svg>
`;
}

const EXTERIORS = [
  { wall: "#f4d6b0", roof: "#9a3412", door: "#1e3a8a", sky: "#bfdbfe" },
  { wall: "#d9f99d", roof: "#3f6212", door: "#7c2d12", sky: "#e0f2fe" },
  { wall: "#e7e5e4", roof: "#44403c", door: "#b91c1c", sky: "#c7d2fe" },
  { wall: "#fde68a", roof: "#78350f", door: "#065f46", sky: "#bae6fd" },
  { wall: "#fecdd3", roof: "#881337", door: "#334155", sky: "#ddd6fe" },
  { wall: "#bfdbfe", roof: "#1e3a8a", door: "#a16207", sky: "#fef3c7" },
  { wall: "#ccfbf1", roof: "#115e59", door: "#9f1239", sky: "#e0e7ff" },
  { wall: "#f5f5f4", roof: "#0f172a", door: "#ca8a04", sky: "#fde7f3" },
];

function exterior({ wall, roof, door, sky }, i) {
  const wide = i % 2 === 0;
  const x = wide ? 170 : 250;
  const w = wide ? 460 : 300;
  const win = (wx) =>
    `<rect x="${wx}" y="330" width="70" height="60" rx="4" fill="#e0f2fe" stroke="#ffffff" stroke-width="6"/>`;
  const windows = wide ? win(x + 50) + win(x + w - 120) : win(x + 30) + win(x + w - 100);
  return frame(
    `<rect y="430" width="${W}" height="170" fill="#86efac"/>
<rect y="430" width="${W}" height="12" fill="#4ade80"/>
<circle cx="${wide ? 680 : 120}" cy="110" r="46" fill="#fde047"/>
<rect x="${x}" y="270" width="${w}" height="190" fill="${wall}"/>
<polygon points="${x - 30},280 ${x + w / 2},150 ${x + w + 30},280" fill="${roof}"/>
<rect x="${x + w / 2 - 35}" y="350" width="70" height="110" rx="6" fill="${door}"/>
<circle cx="${x + w / 2 + 22}" cy="408" r="5" fill="#fde047"/>
${windows}
<rect x="${x + w / 2 - 60}" y="460" width="120" height="140" fill="#d6d3d1"/>
<circle cx="${wide ? 90 : 680}" cy="380" r="60" fill="#22c55e"/><rect x="${wide ? 82 : 672}" y="420" width="16" height="50" fill="#78350f"/>`,
    sky,
  );
}

// A mid-rise for condos: one facade, a grid of windows, a lobby door.
function building({ wall, roof, door, sky }) {
  const cols = 5;
  const rows = 4;
  const win = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      win.push(`<rect x="${245 + c * 66}" y="${150 + r * 66}" width="40" height="44" rx="3" fill="#e0f2fe"/>`);
    }
  }
  return frame(
    `<rect y="440" width="${W}" height="160" fill="#d6d3d1"/>
<rect x="220" y="120" width="360" height="330" fill="${wall}"/>
<rect x="210" y="104" width="380" height="20" fill="${roof}"/>
${win.join("")}
<rect x="370" y="400" width="60" height="50" fill="${door}"/>
<circle cx="120" cy="380" r="56" fill="#22c55e"/><rect x="112" y="420" width="16" height="30" fill="#78350f"/>
<circle cx="680" cy="380" r="56" fill="#22c55e"/><rect x="672" y="420" width="16" height="30" fill="#78350f"/>`,
    sky,
  );
}

// Three attached houses for townhomes.
function rowHouses({ wall, roof, door, sky }) {
  const unit = (x, tint) =>
    `<rect x="${x}" y="250" width="160" height="200" fill="${tint}"/>
<polygon points="${x - 6},256 ${x + 80},170 ${x + 166},256" fill="${roof}"/>
<rect x="${x + 55}" y="360" width="50" height="90" rx="4" fill="${door}"/>
<rect x="${x + 30}" y="280" width="40" height="44" rx="3" fill="#e0f2fe"/><rect x="${x + 90}" y="280" width="40" height="44" rx="3" fill="#e0f2fe"/>`;
  return frame(
    `<rect y="440" width="${W}" height="160" fill="#86efac"/>
${unit(160, wall)}${unit(320, "#e7e5e4")}${unit(480, wall)}`,
    sky,
  );
}

const ROOMS = {
  living: (c) =>
    frame(
      `<rect y="430" width="${W}" height="170" fill="${c.floor}"/>
<rect x="470" y="110" width="220" height="190" rx="6" fill="#e0f2fe" stroke="#ffffff" stroke-width="10"/>
<rect x="120" y="320" width="320" height="130" rx="26" fill="${c.accent}"/>
<rect x="100" y="300" width="60" height="150" rx="20" fill="${c.accent}"/>
<rect x="400" y="300" width="60" height="150" rx="20" fill="${c.accent}"/>
<rect x="560" y="390" width="140" height="60" rx="8" fill="#a8a29e"/>
<rect x="210" y="140" width="140" height="100" rx="4" fill="#fef3c7" stroke="#78716c" stroke-width="6"/>`,
      c.wall,
    ),
  kitchen: (c) =>
    frame(
      `<rect y="460" width="${W}" height="140" fill="${c.floor}"/>
<rect x="80" y="90" width="640" height="130" rx="6" fill="${c.accent}"/>
<line x1="293" y1="90" x2="293" y2="220" stroke="#00000022" stroke-width="4"/><line x1="506" y1="90" x2="506" y2="220" stroke="#00000022" stroke-width="4"/>
<rect x="80" y="300" width="640" height="24" fill="#e7e5e4"/>
<rect x="80" y="324" width="640" height="136" fill="${c.accent}"/>
<rect x="330" y="250" width="140" height="50" rx="8" fill="#d6d3d1"/>
<circle cx="200" cy="392" r="10" fill="#57534e"/><circle cx="600" cy="392" r="10" fill="#57534e"/>`,
      c.wall,
    ),
  bedroom: (c) =>
    frame(
      `<rect y="440" width="${W}" height="160" fill="${c.floor}"/>
<rect x="200" y="250" width="400" height="80" rx="12" fill="#ffffff"/>
<rect x="180" y="320" width="440" height="130" rx="16" fill="${c.accent}"/>
<rect x="180" y="200" width="440" height="60" rx="12" fill="#78716c"/>
<rect x="640" y="350" width="90" height="100" rx="8" fill="#a8a29e"/>
<circle cx="685" cy="320" r="26" fill="#fde68a"/>
<rect x="60" y="120" width="100" height="150" rx="6" fill="#e0f2fe" stroke="#ffffff" stroke-width="8"/>`,
      c.wall,
    ),
  bath: (c) =>
    frame(
      `<rect y="450" width="${W}" height="150" fill="${c.floor}"/>
<rect x="100" y="320" width="380" height="140" rx="40" fill="#ffffff" stroke="#d6d3d1" stroke-width="6"/>
<rect x="560" y="300" width="160" height="160" rx="8" fill="${c.accent}"/>
<rect x="580" y="120" width="120" height="150" rx="60" fill="#e0f2fe" stroke="#a8a29e" stroke-width="6"/>
<rect x="250" y="250" width="12" height="80" fill="#a8a29e"/>`,
      c.wall,
    ),
  yard: (c) =>
    frame(
      `<rect y="380" width="${W}" height="220" fill="#86efac"/>
<g fill="${c.accent}">${Array.from({ length: 14 }, (_, k) => `<rect x="${k * 60}" y="300" width="40" height="110" rx="4"/>`).join("")}</g>
<rect y="330" width="${W}" height="14" fill="${c.accent}"/>
<circle cx="600" cy="230" r="90" fill="#16a34a"/><rect x="590" y="300" width="22" height="110" fill="#78350f"/>
<rect x="140" y="440" width="200" height="16" rx="8" fill="#a16207"/><rect x="150" y="456" width="10" height="40" fill="#a16207"/><rect x="320" y="456" width="10" height="40" fill="#a16207"/>`,
      c.wall,
    ),
};
const ROOM_PALETTES = [
  { wall: "#f5f5f4", floor: "#d6b48c", accent: "#64748b" },
  { wall: "#ecfccb", floor: "#a8a29e", accent: "#b45309" },
  { wall: "#e0e7ff", floor: "#c2a27c", accent: "#0f766e" },
];
// Plain sky colours for the yard scene, one per palette.
const YARD_SKY = ["#bae6fd", "#e0f2fe", "#c7d2fe"];

// ── Homes ────────────────────────────────────────────────────────────────────
// Real metro names so Local mode can place a player, invented everything else.
const CITIES = [
  { city: "Austin", state: "TX", lat: 30.2672, lon: -97.7431, base: 550_000 },
  { city: "Denver", state: "CO", lat: 39.7392, lon: -104.9903, base: 600_000 },
  { city: "Columbus", state: "OH", lat: 39.9612, lon: -82.9988, base: 320_000 },
  { city: "Portland", state: "OR", lat: 45.5152, lon: -122.6784, base: 520_000 },
  { city: "Raleigh", state: "NC", lat: 35.7796, lon: -78.6382, base: 430_000 },
];
const STREETS = ["Sample St", "Placeholder Ave", "Example Way", "Demo Dr", "Fixture Ct", "Mock Ln"];
const TYPES = ["single_family", "single_family", "single_family", "condos", "townhomes"];
const PER_CITY = 6;

const properties = [];
const galleries = {};
const details = {};
let n = 0;

for (const c of CITIES) {
  for (let k = 0; k < PER_CITY; k++) {
    n++;
    const id = `sample-${String(n).padStart(3, "0")}`;
    // One standout per city keeps the "big spender" slot meaningful.
    const luxe = k === 0;
    const propertyType = luxe ? "single_family" : pick(TYPES);
    const beds = luxe ? 5 : propertyType === "condos" ? pick([1, 2]) : pick([2, 3, 3, 4]);
    const baths = luxe ? 4.5 : Math.max(1, beds - pick([0, 1])) + pick([0, 0.5]);
    const sqft = roundTo(luxe ? between(4200, 6500) : beds * between(450, 700) + 300, 10);
    const price = roundTo(luxe ? c.base * between(4, 7) : c.base * between(0.55, 1.5) * (sqft / 1900), 1000);
    const yearBuilt = Math.floor(between(1925, 2024));
    const look = (n - 1) % EXTERIORS.length;
    const ext =
      propertyType === "condos"
        ? `/sample/building-${look % 4}.svg`
        : propertyType === "townhomes"
          ? `/sample/townhouse-${look % 4}.svg`
          : `/sample/exterior-${look}.svg`;
    const pal = n % ROOM_PALETTES.length;
    const rooms = ["living", "kitchen", "bedroom", "bath", "yard"].map((r) => `/sample/${r}-${pal}.svg`);

    properties.push({
      id,
      price,
      city: c.city,
      state: c.state,
      address: `${100 + n * 7} ${STREETS[n % STREETS.length]}`,
      lat: Number((c.lat + between(-0.06, 0.06)).toFixed(6)),
      lon: Number((c.lon + between(-0.06, 0.06)).toFixed(6)),
      beds,
      baths,
      sqft,
      yearBuilt,
      propertyType,
      photos: [ext, rooms[0], rooms[1], rooms[2]],
    });
    galleries[id] = [ext, ...rooms];
    details[id] = {
      text:
        `Sample listing for local development — not a real home. ` +
        `This made-up ${beds}-bedroom ${propertyType === "condos" ? "condo" : "home"} in ${c.city} ` +
        `has a bright living room, an updated kitchen and a small yard. ` +
        `Every detail here is invented so contributors can run Dillow without real listing data.`,
      lotSqft: propertyType === "condos" ? null : roundTo(between(3000, luxe ? 40000 : 9000), 10),
      stories: propertyType === "condos" ? 1 : pick([1, 2, 2]),
      garage: propertyType === "condos" ? null : pick([1, 2, 2, 3]),
      pricePerSqft: Math.round(price / sqft),
      listDate: `2026-${String(1 + Math.floor(rand() * 9)).padStart(2, "0")}-${String(1 + Math.floor(rand() * 28)).padStart(2, "0")}`,
      listingUrl: null,
      zillowUrl: null,
      sections: [
        { parent: "Interior", category: "Bedrooms", items: [`Bedrooms: ${beds}`] },
        { parent: "Interior", category: "Interior Features", items: ["Sample feature: hardwood floors", "Sample feature: walk-in closet"] },
        { parent: "Exterior", category: "Lot", items: ["Sample feature: fenced yard"] },
        { parent: "Other", category: "Sample data", items: ["Generated by scripts/generate-sample-data.mjs"] },
      ],
    };
  }
}

await rm(imgDir, { recursive: true, force: true });
await mkdir(imgDir, { recursive: true });
await mkdir(dataDir, { recursive: true });

await Promise.all([
  ...EXTERIORS.map((e, i) => writeFile(path.join(imgDir, `exterior-${i}.svg`), exterior(e, i))),
  ...EXTERIORS.slice(0, 4).map((e, i) => writeFile(path.join(imgDir, `building-${i}.svg`), building(e))),
  ...EXTERIORS.slice(0, 4).map((e, i) => writeFile(path.join(imgDir, `townhouse-${i}.svg`), rowHouses(e))),
  ...ROOM_PALETTES.flatMap((p, i) =>
    Object.entries(ROOMS).map(([name, draw]) =>
      writeFile(path.join(imgDir, `${name}-${i}.svg`), draw(name === "yard" ? { ...p, wall: YARD_SKY[i] } : p)),
    ),
  ),
]);

// `sample: true` is how scripts/data.mjs tells this dataset apart from the
// real one, so it never ships to production by accident.
const stamp = "2026-01-01T00:00:00.000Z";
await writeFile(
  path.join(dataDir, "pool.json"),
  JSON.stringify({ sample: true, fetchedAt: stamp, properties }, null, 2) + "\n",
);
await writeFile(
  path.join(dataDir, "enrichment.json"),
  JSON.stringify({ sample: true, exportedAt: stamp, galleries, details }, null, 2) + "\n",
);
const images = EXTERIORS.length + 8 + ROOM_PALETTES.length * Object.keys(ROOMS).length;
console.log(`Wrote ${properties.length} sample homes and ${images} illustrations.`);
