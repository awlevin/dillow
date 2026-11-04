// Puts the game's dataset in place before the app builds or runs.
//
// The app imports two JSON files at build time:
//
//   src/data/pool.json         the playable homes — and the answer key
//   src/data/enrichment.json   full photo galleries + listing details
//
// Neither is committed. The real files hold realtor.com listing content (not
// ours to publish) and every future daily answer, so they live in a PRIVATE
// Vercel Blob store and are pulled in at build time. Without credentials the
// app uses the fake dataset committed in src/data/sample/.
//
//   node scripts/data.mjs prepare   run automatically before dev/build/typecheck
//   node scripts/data.mjs pull      fetch the real data (overwrites local files)
//   node scripts/data.mjs push      upload local real data to the store
//   node scripts/data.mjs status    show which dataset is active
//
// Source selection (prepare):
//   DILLOW_DATA_SOURCE=sample  always use the sample dataset
//   DILLOW_DATA_SOURCE=blob    always pull from the store (fail if unreachable)
//   unset (auto):
//     on Vercel  → pull from the store; FAIL the build if that is impossible,
//                  so production can never quietly ship the sample homes
//     elsewhere  → keep existing local real data (e.g. fresh from
//                  /api/refresh) → else pull if credentials exist → else sample
//
// Credentials: BLOB_READ_WRITE_TOKEN, injected by Vercel when the store is
// connected to the project (`vercel env pull .env.local` for local use).
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnv } from "./env.mjs";

const root = process.cwd();
const dataDir = path.join(root, "src", "data");
const sampleDir = path.join(dataDir, "sample");
const FILES = ["pool.json", "enrichment.json"];
// Blob pathnames. `current/` is what builds read; every push also keeps a
// timestamped copy under `archive/` so a bad upload can be rolled back.
const CURRENT = "current";

const log = (msg) => console.log(`[data] ${msg}`);
class DataError extends Error {}

function requireToken(env) {
  if (!env.BLOB_READ_WRITE_TOKEN) {
    throw new DataError("No BLOB_READ_WRITE_TOKEN (run `vercel env pull .env.local`).");
  }
  return env.BLOB_READ_WRITE_TOKEN;
}

// A read-write token looks like vercel_blob_rw_<storeId>_<secret>.
function blobUrl(token, pathname) {
  const storeId = token.split("_")[3];
  if (!storeId) throw new DataError("BLOB_READ_WRITE_TOKEN is malformed (no store id).");
  return `https://${storeId}.private.blob.vercel-storage.com/${pathname}`;
}

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

// Structural checks only: enough to stop a truncated, wrong or sample file
// from reaching a build or the store, not a full schema.
function validateReal(name, json) {
  if (json?.sample === true) throw new DataError(`${name} is the SAMPLE dataset.`);
  if (name === "pool.json") {
    const props = json?.properties;
    if (!Array.isArray(props) || props.length === 0) throw new DataError("pool.json has no properties.");
    for (const p of props) {
      if (typeof p?.id !== "string" || typeof p?.price !== "number" || !Array.isArray(p?.photos)) {
        throw new DataError(`pool.json has a malformed property: ${JSON.stringify(p).slice(0, 120)}`);
      }
    }
  } else if (typeof json?.galleries !== "object" || typeof json?.details !== "object") {
    throw new DataError("enrichment.json is missing galleries/details.");
  }
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

// What each data file in src/data is right now: "real", "sample" or "missing".
async function localKinds() {
  return Promise.all(
    FILES.map(async (f) => {
      const json = await readJson(path.join(dataDir, f));
      if (!json) return "missing";
      return json.sample === true ? "sample" : "real";
    }),
  );
}

async function writeAtomic(file, buf) {
  const tmp = `${file}.tmp-${process.pid}`;
  await writeFile(tmp, buf);
  await rename(tmp, file);
}

async function pull(token) {
  // Fetch and validate BOTH files before writing either, so a failure never
  // leaves a real pool next to a sample enrichment (or vice versa).
  const fetched = await Promise.all(
    FILES.map(async (f) => {
      const url = `${blobUrl(token, `${CURRENT}/${f}`)}?cache=0`;
      let res;
      for (let attempt = 1; ; attempt++) {
        try {
          res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
          if (res.ok || res.status < 500 || attempt === 3) break;
        } catch (err) {
          if (attempt === 3) throw new DataError(`Could not reach the data store for ${f}: ${err.message}`);
        }
        await new Promise((r) => setTimeout(r, attempt * 1000));
      }
      if (!res.ok) throw new DataError(`Data store returned ${res.status} for ${CURRENT}/${f}.`);
      const buf = Buffer.from(await res.arrayBuffer());
      let json;
      try {
        json = JSON.parse(buf.toString("utf8"));
      } catch {
        throw new DataError(`${f} from the data store is not valid JSON.`);
      }
      validateReal(f, json);
      return { f, buf, json };
    }),
  );
  await mkdir(dataDir, { recursive: true });
  for (const { f, buf, json } of fetched) {
    await writeAtomic(path.join(dataDir, f), buf);
    const count = f === "pool.json" ? `${json.properties.length} homes` : `${Object.keys(json.galleries).length} galleries`;
    log(`pulled ${f}: ${count}, sha256 ${sha256(buf).slice(0, 16)}`);
  }
}

// Copy the sample over every file not already holding real data.
async function copySample(kinds = FILES.map(() => "missing")) {
  await mkdir(dataDir, { recursive: true });
  for (const [i, f] of FILES.entries()) {
    if (kinds[i] !== "real") await copyFile(path.join(sampleDir, f), path.join(dataDir, f));
  }
  log("using the SAMPLE dataset (src/data/sample) — fake homes for development.");
}

async function prepare(env) {
  const source = env.DILLOW_DATA_SOURCE || "auto";
  const token = env.BLOB_READ_WRITE_TOKEN;
  const onVercel = Boolean(env.VERCEL);

  if (source === "sample") return copySample();
  if (source === "blob" || (source === "auto" && onVercel)) {
    if (!token) {
      throw new DataError(
        "No BLOB_READ_WRITE_TOKEN. Connect the private data store to this project, " +
          "or set DILLOW_DATA_SOURCE=sample to deploy the sample dataset on purpose.",
      );
    }
    return pull(token);
  }
  if (source !== "auto") throw new DataError(`Unknown DILLOW_DATA_SOURCE "${source}" (use blob or sample).`);

  // Local: never clobber real data the maintainer may not have pushed yet
  // (e.g. a pool fresh from /api/refresh).
  const kinds = await localKinds();
  if (kinds.every((k) => k === "real")) {
    return log("using local real data in src/data (`npm run data:pull` replaces it with the store's copy).");
  }
  if (kinds.includes("real")) {
    await copySample(kinds);
    return log("kept local real data; filled the other file from the sample.");
  }
  if (token) {
    try {
      return await pull(token);
    } catch (err) {
      log(`could not pull real data (${err.message}) — falling back to the sample.`);
    }
  }
  return copySample();
}

function vercelCli() {
  for (const cmd of ["vercel", "npx"]) {
    try {
      execFileSync(cmd, ["--version"], { stdio: "ignore" });
      return cmd === "vercel" ? ["vercel"] : ["npx", "--yes", "vercel@latest"];
    } catch {
      /* try the next */
    }
  }
  throw new DataError("The Vercel CLI is required to push (npm i -g vercel).");
}

async function push(env) {
  const token = requireToken(env);
  const hashes = {};
  for (const f of FILES) {
    let buf, json;
    try {
      buf = await readFile(path.join(dataDir, f));
      json = JSON.parse(buf.toString("utf8"));
    } catch {
      throw new DataError(`src/data/${f} is missing or not valid JSON.`);
    }
    validateReal(f, json);
    hashes[f] = sha256(buf).slice(0, 16);
  }
  const [cmd, ...pre] = vercelCli();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  for (const f of FILES) {
    const file = path.join(dataDir, f);
    const base = [...pre, "blob", "put", file, "--access", "private", "--content-type", "application/json"];
    const auth = ["--rw-token", token];
    // Archive first: if the run dies halfway, `current/` is still consistent.
    execFileSync(cmd, [...base, "--pathname", `archive/${stamp}/${f}`, ...auth], { stdio: "inherit" });
    execFileSync(
      cmd,
      [...base, "--pathname", `${CURRENT}/${f}`, "--allow-overwrite", "true", "--cache-control-max-age", "60", ...auth],
      { stdio: "inherit" },
    );
    log(`pushed ${f} (sha256 ${hashes[f]}), archived as archive/${stamp}/${f}`);
  }
  log("done. Redeploy production to ship it: `vercel redeploy dillow.homes --target production` or push to main.");
}

async function status() {
  const kinds = await localKinds();
  for (const [i, f] of FILES.entries()) {
    let hash = "";
    if (kinds[i] !== "missing") hash = `, sha256 ${sha256(await readFile(path.join(dataDir, f))).slice(0, 16)}`;
    log(`src/data/${f}: ${kinds[i]}${hash}`);
  }
}

const commands = { prepare, pull: (env) => pull(requireToken(env)), push, status };
const cmd = process.argv[2];
if (!commands[cmd]) {
  console.error(`usage: node scripts/data.mjs <${Object.keys(commands).join("|")}>`);
  process.exit(2);
}
try {
  await commands[cmd](await loadEnv(root));
} catch (err) {
  console.error(`[data] ERROR: ${err instanceof DataError ? err.message : err.stack}`);
  process.exit(1);
}
