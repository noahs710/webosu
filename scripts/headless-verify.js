// Headless runtime verification of the ESM game port. Spawns Vite, loads
// /browse in chromium, and checks the ESM bootstrap actually runs:
// window.launchGame exists + readiness flags + globals. Captures console errors.
const { spawn } = require("child_process");
const { chromium } = require("playwright");

const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js","--port","5176","--strictPort"], { stdio:["ignore","pipe","pipe"] });
const kids = [vite];
let viteErr = "";
vite.stderr.on("data", d => viteErr += d);

async function wait(url, ms=20000){const t0=Date.now();while(Date.now()-t0<ms){try{const r=await fetch(url);if(r.status<500)return true;}catch(e){}await new Promise(r=>setTimeout(r,200));}return false;}

async function main() {
  if (!(await wait("http://localhost:5176/browse"))) { console.log("vite not ready"); console.log(viteErr); process.exit(1); }
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [], consoleErr = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (m.type()==="error") consoleErr.push(m.text()); });
  await page.goto("http://localhost:5176/browse", { waitUntil: "load", timeout: 30000 });
  // give skin+sound loading time
  await page.waitForTimeout(6000);
  await page.evaluate(() => window.__ensureGame && window.__ensureGame()).catch(() => {});
  await page.waitForFunction(() => window.skinReady, null, { timeout: 15000 }).catch(() => {});
  const state = await page.evaluate(() => ({
    launchGame: typeof window.launchGame,
    launchReplay: typeof window.launchReplay,
    Osu: typeof window.Osu,
    Playback: typeof window.Playback,
    game: !!window.game,
    zip: typeof window.zip,
    PIXI: typeof window.PIXI,
    mp3Parser: typeof window.mp3Parser,
    sounds: typeof window.sounds,
    underscore_: typeof window._,
    scriptReady: !!window.scriptReady,
    skinReady: !!window.skinReady,
    soundReady: !!window.soundReady,
    localforage: typeof window.localforage,
  }));
  console.log("=== ESM bootstrap state ===");
  for (const k of Object.keys(state)) console.log("  " + k + " = " + state[k]);
  console.log("=== pageerrors (" + errors.length + ") ===");
  errors.slice(0,10).forEach(e => console.log("  " + e));
  console.log("=== console errors (" + consoleErr.length + ") ===");
  consoleErr.slice(0,10).forEach(e => console.log("  " + e));
  // filter network/catboy errors (expected, no external net here)
  const fatal = errors.filter(e => !/catboy|fetch|network|Failed to fetch/i.test(e));
  const bootOk = state.launchGame === "function" && state.launchReplay === "function" && state.Osu === "function" && state.Playback === "function" && state.game;
  console.log("\nBOOTstrap OK: " + bootOk + "  fatalErrors: " + fatal.length);
  await browser.close();
  for (const k of kids) try{k.kill("SIGTERM")}catch(e){}
  process.exit(bootOk && fatal.length===0 ? 0 : 1);
}
main().catch(async e => { console.error("FATAL", e); for(const k of kids)try{k.kill()}catch(_){}; process.exit(2); });
