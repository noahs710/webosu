/* Headless-verify the PRODUCTION build (dist/) served by `vite preview`.
 * Confirms the Vite build + copy-static.mjs produced a self-contained,
 * correctly-styled, working site:
 *   - browse-v2.html renders beatmap cards + the --lazer-pink token (shell CSS loaded)
 *   - index-v2.html boots the ESM game entry with 0 pageerrors
 *   - index.html (legacy AMD fallback) loads with 0 fatal pageerrors
 * Run: node scripts/headless-build.js  (after: npm run build)
 */
const { spawn } = require("child_process");
const { chromium } = require("playwright");

const preview = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--port", "5180", "--strictPort"], { stdio: ["ignore", "pipe", "pipe"] });
const kids = [preview];
let pe = ""; preview.stderr.on("data", (d) => (pe += d));

async function wait(url, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { const r = await fetch(url); if (r.status < 500) return true; } catch (e) {} await new Promise((r) => setTimeout(r, 200)); }
  return false;
}

async function load(page, url) {
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/catboy|api\/activity|500|assets\.ppy|Failed to fetch|ERR_|net::|blocked by client/i.test(m.text())) console.log("  CONSOLE-ERR:", m.text().slice(0, 160)); });
  await page.goto(url, { waitUntil: "load", timeout: 30000 });
  return errs;
}

async function main() {
  if (!(await wait("http://localhost:5180/"))) { console.log("vite preview not ready", pe); process.exit(1); }
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });

  // browse-v2 shell
  const fontHosts = new Set();
  ctx.on("request", (r) => { const h = new URL(r.url()).hostname; if (/(woff2?|ttf|font)/.test(r.url()) || h.includes("fonts.")) fontHosts.add(h); });
  const p1 = await ctx.newPage();
  const e1 = await load(p1, "http://localhost:5180/browse-v2.html");
  let cards = -1;
  try { await p1.waitForFunction(() => document.querySelectorAll(".beatmap-card").length > 0, null, { timeout: 20000 }); cards = await p1.evaluate(() => document.querySelectorAll(".beatmap-card").length); } catch (e) {}
  const lazer = (await p1.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--lazer-pink"))).trim();
  const fontCheck = await p1.evaluate(() => {
    const el = document.querySelector(".beatmapcard-title, .brand, h2") || document.body;
    const ff = getComputedStyle(el).fontFamily;
    return { fontFamily: ff, isComfortaa: /comfortaa/i.test(ff) };
  });
  const gfontsRequested = [...fontHosts].filter((h) => h.includes("fonts.googleapis.com") || h.includes("fonts.gstatic.com"));
  console.log("=== browse-v2 (built) ===");
  console.log("  cards:", cards, " --lazer-pink:", lazer, " font:", fontCheck.fontFamily, " pageerrors:", e1.length);
  console.log("  self-hosted font (no gstatic/googleapis):", gfontsRequested.length === 0, JSON.stringify(gfontsRequested));
  try { await p1.screenshot({ path: "scripts/browse-v2-built.png", fullPage: true }); console.log("  screenshot: scripts/browse-v2-built.png"); } catch (e) {}

  // index-v2 game entry boot
  const p2 = await ctx.newPage();
  const e2 = await load(p2, "http://localhost:5180/index-v2.html");
  let ready = await p2.evaluate(() => ({ scriptReady: !!window.scriptReady, skinReady: !!window.skinReady, pixi: typeof window.PIXI, app: !!window.app }));
  console.log("=== index-v2 (built) ===");
  console.log("  ", JSON.stringify(ready), "pageerrors:", e2.length);

  // legacy index.html (AMD fallback) loads — jsloader injects require.js
  // asynchronously, so wait for window.require before sampling.
  const p3 = await ctx.newPage();
  const e3 = await load(p3, "http://localhost:5180/index.html");
  let legacy = await p3.evaluate(() => ({ title: document.title, hasRequire: typeof window.require, hasGame: typeof window.game }));
  try { await p3.waitForFunction(() => typeof window.require !== "undefined" || typeof window.game !== "undefined", null, { timeout: 8000 }); } catch (e) {}
  legacy = await p3.evaluate(() => ({ title: document.title, hasRequire: typeof window.require, hasGame: typeof window.game, skinReady: typeof window.skinReady, lazerPink: getComputedStyle(document.documentElement).getPropertyValue("--lazer-pink").trim() }));
  console.log("=== index.html legacy (built) ===");
  console.log("  ", JSON.stringify(legacy), "pageerrors:", e3.length);
  if (!legacy.lazerPink) console.log("  WARN: legacy page missing --lazer-pink (tokens.css not wired)");
  e3.slice(0, 4).forEach((e) => console.log("    " + e.slice(0, 160)));

  // legacy AMD fallback pages (browse/leaderboard) also load on the built dist
  async function legacyPage(file) {
    const pg = await ctx.newPage();
    const er = await load(pg, "http://localhost:5180/" + file);
    try { await pg.waitForFunction(() => typeof window.require !== "undefined", null, { timeout: 8000 }); } catch (e) {}
    const st = await pg.evaluate(() => ({ hasRequire: typeof window.require, lazerPink: getComputedStyle(document.documentElement).getPropertyValue("--lazer-pink").trim() }));
    const f = fatal(er);
    console.log("=== " + file + " legacy (built) ===");
    console.log("  ", JSON.stringify(st), "pageerrors:", er.length, "fatal:", f);
    await pg.close();
    return f;
  }
  const fatal = (arr) => arr.filter((e) => !/catboy|assets\.ppy|ERR_|net::|Failed to fetch|api\/activity|blocked by client|404/i.test(e)).length;
  const f1 = fatal(e1), f2 = fatal(e2), f3 = fatal(e3);
  const f4 = await legacyPage("browse.html");
  const f5 = await legacyPage("leaderboard.html");
  console.log("\nFATAL: browse-v2", f1, " index-v2", f2, " legacy-index", f3, " legacy-browse", f4, " legacy-leaderboard", f5);
  await b.close();
  for (const k of kids) try { k.kill("SIGTERM"); } catch (e) {}
  const ok = cards > 0 && lazer.length > 0 && fontCheck.isComfortaa && gfontsRequested.length === 0 && f1 === 0 && f2 === 0 && f3 === 0 && f4 === 0 && f5 === 0;
  process.exit(ok ? 0 : 1);
}
main().catch(async (e) => { console.error("FATAL", e); for (const k of kids) try { k.kill(); } catch (_) {} process.exit(2); });
