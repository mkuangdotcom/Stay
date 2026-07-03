/**
 * Load .env.local / .env into process.env for CLI scripts
 * (Next.js does this for the app; tsx does not).
 * Import this before anything that reads process.env.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

for (const name of [".env.local", ".env"]) {
  const path = join(process.cwd(), name);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, key, raw] = m;
    if (process.env[key] !== undefined) continue;
    process.env[key] = raw.replace(/^["']|["']$/g, "");
  }
}
