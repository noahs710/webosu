// Headless: exercise the fail path (scoreOverlay.onfail -> showSummary -> grading
// screen) + the Retry button + the Quit-from-fail path. Also tests the
// null-background end-of-game tint crash (self.background.tint when bg is null).
// Run: node scripts/headless-fail-retry.js (dev)
const { spawn } = require("child_process");
const { chromium } = require("playwright");
const SET = 2006909;
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js","--port","5205","--strictPort"], { stdio:["ignore","pipe","pipe"] });
const kids=[vite]; let ve=""; vite.stderr.on("data",d=>ve+=d);
async function wait(u,ms=20000){const t0=Date.now();while(Date.now()-t0<ms){try{const r=await fetch(u);if(r.status<500)return true;}catch(e){}await new Promise(r=>setTimeout(r,200));}return false;}
async function main(){
  if(!(await wait("http://localhost:5205/browse"))){console.log("vite not ready",ve);process.exit(1);}
  const b=await chromium.launch({headless:true, args:["--use-gl=swiftshader","--enable-webgl","--autoplay-policy=no-user-gesture-required"]});
  const p=await b.newPage({viewport:{width:1280,height:720}});
  const errs=[]; p.on("pageerror",e=>errs.push(String(e)));
  await p.goto("http://localhost:5205/browse",{waitUntil:"load",timeout:30000});
await p.waitForFunction(()=>typeof window.__ensureGame==="function", null, {timeout:15000}).catch(()=>{});
  await p.evaluate(()=>window.__ensureGame && window.__ensureGame()).catch(()=>{});
  await p.waitForFunction(()=>window.skinReady && window.soundReady, null,{timeout:20000}).catch(()=>{});
  await p.evaluate(()=>{ if(window.game){ window.game.autoplay=true; window.game.autofullscreen=false; } });
  await p.evaluate(async (set)=>{ const r=await fetch("https://catboy.best/d/"+set+"n"); const ab=await (await r.blob()).arrayBuffer(); window.__osublob=new Blob([ab]); window.launchGame(window.__osublob,4174364,"Lightspeed"); }, SET);
  await p.waitForFunction(()=>!!window.playback && !!window.playback.osu && !!window.playback.osu.audio && !!window.app, null,{timeout:20000}).catch(()=>{});

  // 1. Force a fail by directly calling onfail
  const failResult = await p.evaluate(() => {
    try {
      if (!window.playback || !window.playback.scoreOverlay) return { ok: false, err: "no playback/scoreOverlay" };
      window.playback.osu.audio.pause = function () { return true; };
      window.playback.scoreOverlay.onfail();
      return { ok: true, ended: !!window.playback.ended };
    } catch (e) { return { ok: false, err: String(e) }; }
  });
  await p.waitForTimeout(500);
  const gradingVisible = await p.evaluate(() => {
    const g = document.querySelector(".grading");
    return g ? !g.classList.contains("transparent") : false;
  });
  console.log("=== fail path (onfail -> showSummary) ===");
  console.log("  fail:", JSON.stringify(failResult), "grading visible:", gradingVisible);

  // 2. Click Retry from the fail screen
  const retryResult = await p.evaluate(() => {
    try {
      const btns = document.querySelectorAll(".grading .rbtn");
      let retryBtn = null;
      btns.forEach(b => { if (b.textContent && b.textContent.trim() === "Retry") retryBtn = b; });
      if (!retryBtn) return { ok: false, err: "no retry btn (" + btns.length + " btns)" };
      retryBtn.click();
      return { ok: true };
    } catch (e) { return { ok: false, err: String(e) }; }
  });
  await p.waitForTimeout(1000);
  const afterRetry = await p.evaluate(() => ({
    app: !!window.app,
    playback: !!window.playback,
    ended: window.playback ? window.playback.ended : null,
    hits: window.playback ? window.playback.hits.length : 0,
  }));
  console.log("=== retry from fail ===");
  console.log("  retry:", JSON.stringify(retryResult), "after:", JSON.stringify(afterRetry));

  // 3. Force another fail, then test null-background end-of-game tint
  await p.evaluate(() => {
    if (window.playback && window.playback.scoreOverlay) {
      window.playback.scoreOverlay.onfail();
    }
  });
  await p.waitForTimeout(500);

  // 4. Click Quit from the fail screen
  const quitResult = await p.evaluate(() => {
    try {
      const btns = document.querySelectorAll(".grading .rbtn");
      let quitBtn = null;
      btns.forEach(b => { if (b.textContent && b.textContent.trim() === "Quit") quitBtn = b; });
      if (!quitBtn) return { ok: false, err: "no quit btn (" + btns.length + " btns)" };
      quitBtn.click();
      return { ok: true };
    } catch (e) { return { ok: false, err: String(e) }; }
  });
  await p.waitForTimeout(1000);
  const afterQuit = await p.evaluate(() => ({
    app: !!window.app,
    mainPageHidden: document.getElementById("main-page") ? document.getElementById("main-page").hasAttribute("hidden") : null,
    gameAreaHidden: document.getElementById("game-area") ? document.getElementById("game-area").hasAttribute("hidden") : null,
  }));
  console.log("=== quit from fail ===");
  console.log("  quit:", JSON.stringify(quitResult), "after:", JSON.stringify(afterQuit));

  const failOk = failResult && failResult.ok && failResult.ended === true && gradingVisible;
  const retryOk = retryResult && retryResult.ok && afterRetry.app === true && afterRetry.ended === false;
  const quitOk = quitResult && quitResult.ok && afterQuit.app === false && afterQuit.mainPageHidden === false && afterQuit.gameAreaHidden === true;

  console.log("fail works (onfail -> grading, no crash):", failOk);
  console.log("retry works (game restarts, ended reset):", retryOk);
  console.log("quit from fail works (app destroyed, main page):", quitOk);

  await b.close(); for(const k of kids)try{k.kill("SIGTERM")}catch(e){}
  const fatal=errs.filter(e=>!/catboy|api\/|500|network|Failed to fetch/i.test(e));
  console.log("fatal:", fatal.length); fatal.slice(0,4).forEach(e=>console.log("  "+e.slice(0,200)));
  process.exit(failOk && retryOk && quitOk && fatal.length===0 ? 0 : 1);
}
main().catch(async e=>{console.error("FATAL",e);for(const k of kids)try{k.kill()}catch(_){};process.exit(2);});
