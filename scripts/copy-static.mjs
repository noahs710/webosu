/* Postbuild: make the Vite build self-contained for static serving.
 *
 * Vite 7 build drops the legacy shell stylesheets (css/main.css, css/base.css)
 * from the HTML while bundling only css/font.css. The shell pages also depend on
 * classic (non-ESM) scripts and assets (js/, img/, sprites.json, sw.js) that Vite
 * does not copy. This script copies those static dirs/files into dist/ and
 * normalises every built page to load the shell CSS from /css/ (plain, copied),
 * so the built site is self-contained and serveable by Fastify alone.
 *
 * Run automatically via "npm run build" (vite build && node scripts/copy-static.mjs).
 */
import { cpSync, readdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "fs";
import { join } from "path";

const ROOT = import.meta.dirname ? join(import.meta.dirname, "..") : process.cwd();
const DIST = join(ROOT, "dist");
if (!existsSync(DIST)) throw new Error("dist/ not found; run [1mvite build[0m first");

// 1) copy classic static dirs/files that Vite does not bundle
for (const target of ["js", "css", "img", "hitsounds", "skins"]) {
  const src = join(ROOT, target);
  if (!existsSync(src)) continue;
  cpSync(src, join(DIST, target), { recursive: true, force: true });
}
for (const file of ["sw.js", "sprites.json", "manifest.webmanifest", "manifest.json"]) {
  const src = join(ROOT, file);
  if (existsSync(src)) cpSync(src, join(DIST, file), { force: true });
}

// 2) normalise shell CSS links in every built page -> three plain /css/ links
// All pages are Vue SPA — only need font.css (Comfortaa @font-face)
const SHELL_LINKS = ''; // Tailwind CSS (with @font-face) is bundled by Vite — no extra CSS links needed

// 3) generate dist/sw.js with a precache manifest of the actual built files
//    (hashed /assets/* + copied /css /js /img + pages) so the PWA shell works
//    offline against the built site. Source sw.js (dev) keeps its own list.
const swSource = readFileSync(join(ROOT, "sw.js"), "utf8");
const distFiles = [];
(function walk(dir, base) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, name.name);
    const rel = base ? base + "/" + name.name : "/" + name.name;
    if (name.isDirectory()) walk(abs, rel);
    else distFiles.push(rel);
  }
})(DIST, "");
// keep the precache list reasonable: skip sourcemaps + huge non-shell blobs
const SHELL = distFiles.filter((f) => !f.endsWith(".map"));
const swOut = swSource
  .replace(/const CACHE = "[^"]*";/, 'const CACHE = "webosu-v' + Date.now() + '";')
  .replace(/const SHELL = \[[^\]]*\];/, "const SHELL = " + JSON.stringify(SHELL, null, 2) + ";");
writeFileSync(join(DIST, "sw.js"), swOut);
console.log("copy-static: generated dist/sw.js precaching", SHELL.length, "files");

console.log("copy-static: copied js/ css/ img/ + sw.js/sprites.json/manifest");
