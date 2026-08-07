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
  const p1 = await ctx.newPage();
  const e1 = await load(p1, "http://localhost:5180/browse-v2.html");
  let cards = -1;
  try { await p1.waitForFunction(() => document.querySelectorAll(".beatmap-card").length > 0, null, { timeout: 20000 }); cards = await p1.evaluate(() => document.querySelectorAll(".beatmap-card").length); } catch (e) {}
  const lazer = (await p1.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--lazer-pink"))).trim();
  console.log("=== browse-v2 (built) ===");
  console.log("  cards:", cards, " --lazer-pink:", lazer, " pageerrors:", e1.length);

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
  legacy = await p3.evaluate(() => ({ title: document.title, hasRequire: typeof window.require, hasGame: typeof window.game, skinReady: typeof window.skinReady }));
  console.log("=== index.html legacy (built) ===");
  console.log("  ", JSON.stringify(legacy), "pageerrors:", e3.length);
  e3.slice(0, 4).forEach((e) => console.log("    " + e.slice(0, 160)));

  const fatal = (arr) => arr.filter((e) => !/catboy|assets\.ppy|ERR_|net::|Failed to fetch|api\/activity|blocked by client/i.test(e)).length;
  const f1 = fatal(e1), f2 = fatal(e2), f3 = fatal(e3);
  console.log("\nFATAL: browse-v2", f1, " index-v2", f2, " legacy", f3);
  await b.close();
  for (const k of kids) try { k.kill("SIGTERM"); } catch (e) {}
  const ok = cards > 0 && lazer.length > 0 && f1 === 0 && f2 === 0 && f3 === 0;
  process.exit(ok ? 0 : 1);
}
main().catch(async (e) => { console.error("FATAL", e); for (const k of kids) try { k.kill(); } catch (_) {} process.exit(2); });
