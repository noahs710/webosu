// scripts/strip-skin.mjs — Strips a .osk to gameplay-only textures + hitsounds + skin.ini
// Reduces reowoTuna from 40MB → ~0.45MB (84× smaller) by removing menu/ranking/animation files
// that the client's isGameplayTexture filter would discard at runtime anyway.
import { unzipSync, zipSync } from "fflate";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = import.meta.dirname ? join(import.meta.dirname, "..") : process.cwd();
const SRC = join(ROOT, "skins", "default.osk");

if (!existsSync(SRC)) {
  console.log("strip-skin: skins/default.osk not found — skipping (build will use fallback)");
  process.exit(0);
}

const data = readFileSync(SRC);
const files = unzipSync(data);
const keys = Object.keys(files);
const totalFiles = keys.length;
const totalSize = data.length;

// Import the shared filter (same logic as runtime skin-loader.js)
const { isGameplayTexture, isGameplaySound } = await import("../src/game/skin-filter.js");

const kept = {};
let keptCount = 0;
let keptSize = 0;

for (const key of keys) {
  const lower = key.toLowerCase();
  // always keep skin.ini
  if (lower === "skin.ini") {
    kept[key] = files[key];
    keptCount++; keptSize += files[key].length;
    continue;
  }
  // keep gameplay textures
  if (lower.endsWith(".png") && isGameplayTexture(lower)) {
    kept[key] = files[key];
    keptCount++; keptSize += files[key].length;
    continue;
  }
  // keep gameplay sounds
  if (isGameplaySound(lower)) {
    kept[key] = files[key];
    keptCount++; keptSize += files[key].length;
    continue;
  }
}

const stripped = zipSync(kept);
// write to dist/ (not source) — copy-static.mjs would copy from skins/ but
// we write directly to avoid destroying the source .osk
import { mkdirSync } from "fs";
const distSkins = join(ROOT, "dist", "skins");
if (!existsSync(distSkins)) mkdirSync(distSkins, { recursive: true });
writeFileSync(join(distSkins, "default.osk"), stripped);

console.log(`strip-skin: ${totalFiles} → ${keptCount} files, ${(totalSize/1024/1024).toFixed(1)}MB → ${(stripped.length/1024).toFixed(0)}KB (${(stripped.length/totalSize*100).toFixed(1)}% of original)`);