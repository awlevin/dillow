// Plain node scripts (unlike `next dev`) do not load .env.local. Returns
// process.env with .env.local filled in underneath it — real environment
// variables win, as they do in Next.
import { readFile } from "node:fs/promises";
import path from "node:path";

export async function loadEnv(root = process.cwd()) {
  const env = { ...process.env };
  try {
    const raw = await readFile(path.join(root, ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
  } catch {
    /* no .env.local — process.env only */
  }
  return env;
}
