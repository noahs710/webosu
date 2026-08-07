// Capture a full-page screenshot of a URL (default: dev browse-v2) for visual
// verification of shell/theme changes. Usage: node scripts/shot.js [url] [outfile]
const { chromium } = require("playwright");
const url = process.argv[2] || "http://localhost:5173/browse-v2.html";
const out = process.argv[3] || "scripts/shot.png";
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(url, { waitUntil: "load", timeout: 30000 });
  try { await p.waitForFunction(() => document.querySelectorAll(".beatmap-card").length > 0, null, { timeout: 15000 }); } catch (e) {}
  await p.waitForTimeout(800);
  await p.screenshot({ path: out, fullPage: true });
  console.log("saved", out, "pageerrors:", errs.length);
  await b.close();
  process.exit(errs.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
