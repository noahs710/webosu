/* Postbuild: make the Vite build self-contained for static serving.
 *
 * Vite 7 build drops the legacy shell stylesheets (css/main.css, css/picnic.min.css)
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
for (const target of ["js", "css", "img", "hitsounds"]) {
  const src = join(ROOT, target);
  if (!existsSync(src)) continue;
  cpSync(src, join(DIST, target), { recursive: true, force: true });
}
for (const file of ["sw.js", "sprites.json", "manifest.webmanifest", "manifest.json"]) {
  const src = join(ROOT, file);
  if (existsSync(src)) cpSync(src, join(DIST, file), { force: true });
}

// 2) normalise shell CSS links in every built page -> three plain /css/ links
const SHELL_LINKS =
  '  <link rel="stylesheet" href="/css/picnic.min.css">\n' +
  '  <link rel="stylesheet" href="/css/tokens.css">\n' +
  '  <link rel="stylesheet" href="/css/main.css">\n' +
  '  <link rel="stylesheet" href="/css/font.css">\n';

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
  .replace(/const CACHE = "webosu-v1";/, 'const CACHE = "webosu-v' + Date.now() + '";')
  .replace(/const SHELL = \[[^\]]*\];/, "const SHELL = " + JSON.stringify(SHELL, null, 2) + ";");
writeFileSync(join(DIST, "sw.js"), swOut);
console.log("copy-static: generated dist/sw.js precaching", SHELL.length, "files");

let touched = 0;
for (const f of readdirSync(DIST).filter((f) => f.endsWith(".html"))) {
  const p = join(DIST, f);
  let s = readFileSync(p, "utf8");
  const orig = s;
  // remove Vite-bundled shell stylesheet links (/assets/*.css) and any
  // source shell css links; leave the Google Fonts <link> (https) untouched.
  s = s.replace(/<link\s+rel="stylesheet"[^>]*href="\/assets\/[^"]*\.css"[^>]*>\n?/g, "");
  s = s.replace(/<link\s+rel="stylesheet"[^>]*href="(?:\.?\/)?css\/[^"]*\.css"[^>]*>\n?/g, "");
  // inject the three plain /css/ links right after <head>
  s = s.replace(/<head>\n?/, (m) => m + "\n" + SHELL_LINKS);
  if (s !== orig) {
    writeFileSync(p, s);
    touched++;
  }
}
console.log("copy-static: copied js/ css/ img/ + sw.js/sprites.json/manifest; normalised shell CSS in", touched, "pages");
