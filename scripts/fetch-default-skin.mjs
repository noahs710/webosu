// Downloads the default reowoTuna .osk skin to skins/default.osk
// Run: node scripts/fetch-default-skin.mjs
// Or place a .osk file manually at skins/default.osk
import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { copyFileSync } from "fs";

const ROOT = join(import.meta.dirname, "..");
const SKINS_DIR = join(ROOT, "skins");
const TARGET = join(SKINS_DIR, "default.osk");

if (existsSync(TARGET)) {
  console.log("skins/default.osk already exists:", (await import("fs")).statSync(TARGET).size, "bytes");
  process.exit(0);
}

// try common download locations
const candidates = [
  // user's Downloads folder
  join(process.env.USERPROFILE || process.env.HOME || "", "Downloads"),
];

// look for reowoTuna .osk in Downloads
for (const dir of candidates) {
  try {
    const { readdirSync } = await import("fs");
    for (const f of readdirSync(dir)) {
      if (f.toLowerCase().includes("reowotuna") && f.toLowerCase().endsWith(".osk")) {
        if (!existsSync(SKINS_DIR)) mkdirSync(SKINS_DIR, { recursive: true });
        copyFileSync(join(dir, f), TARGET);
        console.log("Copied", f, "to skins/default.osk");
        process.exit(0);
      }
    }
  } catch {}
}

console.warn("skins/default.osk not found. Place a reowoTuna.osk file at skins/default.osk manually.");
console.warn("The game will fall back to sprites.json if the default .osk is missing.");