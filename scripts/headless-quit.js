// Headless: exercise the quit path (pause -> Quit button -> quitGame) to catch
// any implicit-global ReferenceError in quit()/quitGame (the btn_continue class
// of bug). Run: node scripts/headless-quit.js (dev)
const { spawn } = require("child_process");
const { chromium } = require("playwright");
const SET = 2006909;
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js","--port","5204","--strictPort"], { stdio:["ignore","pipe","pipe"] });
const kids=[vite]; let ve=""; vite.stderr.on("data",d=>ve+=d);
async function wait(u,ms=20000){const t0=Date.now();while(Date.now()-t0<ms){try{const r=await fetch(u);if(r.status<500)return true;}catch(e){}await new Promise(r=>setTimeout(r,200));}return false;}
async function main(){
  if(!(await wait("http://localhost:5204/browse"))){console.log("vite not ready",ve);process.exit(1);}
  const b=await chromium.launch({headless:true, args:["--use-gl=swiftshader","--enable-webgl","--autoplay-policy=no-user-gesture-required"]});
  const p=await b.newPage({viewport:{width:1280,height:720}});
  const errs=[]; p.on("pageerror",e=>errs.push(String(e)));
  await p.goto("http://localhost:5204/browse",{waitUntil:"load",timeout:30000});
await p.waitForFunction(()=>typeof window.__ensureGame==="function", null, {timeout:15000}).catch(()=>{});
  await p.evaluate(()=>window.__ensureGame && window.__ensureGame()).catch(()=>{});
  await p.waitForFunction(()=>window.skinReady && window.soundReady, null,{timeout:20000}).catch(()=>{});
  await p.evaluate(()=>{ if(window.game){ window.game.autoplay=true; window.game.autofullscreen=false; } });
  await p.evaluate(async (set)=>{ const r=await fetch("https://catboy.best/d/"+set+"n"); const ab=await (await r.blob()).arrayBuffer(); window.__osublob=new Blob([ab]); window.launchGame(window.__osublob,4174364,"Lightspeed"); }, SET);
  await p.waitForFunction(()=>!!window.playback && !!window.playback.osu && !!window.playback.osu.audio && !!window.app, null,{timeout:20000}).catch(()=>{});
  // pause (mocked audio.pause->true so the btn_quit block runs), then click Quit
  const r = await p.evaluate(() => {
    try {
      window.playback.osu.audio.pause = function () { return true; };
      window.playback.pause();
      const quitBtn = document.getElementById("pausebtn-quit");
      if (!quitBtn) return { ok: false, err: "no quit btn" };
      quitBtn.click();
      return { ok: true, clicked: true };
    } catch (e) { return { ok: false, err: String(e) }; }
  });
  await p.waitForTimeout(1000);
  const after = await p.evaluate(()=>({ app: !!window.app, mainPageHidden: document.getElementById("main-page") ? document.getElementById("main-page").hasAttribute("hidden") : null, gameAreaHidden: document.getElementById("game-area") ? document.getElementById("game-area").hasAttribute("hidden") : null }));
  console.log("=== quit path (pause -> Quit) ==="); console.log("  click:", JSON.stringify(r), "after:", JSON.stringify(after));
  const ok = r && r.ok && after.app === false && after.mainPageHidden === false && after.gameAreaHidden === true;
  console.log("quit works (app destroyed, main page shown, no ReferenceError):", ok);
  await b.close(); for(const k of kids)try{k.kill("SIGTERM")}catch(e){}
  const fatal=errs.filter(e=>!/catboy|api\/|500|network/i.test(e));
  console.log("fatal:", fatal.length); fatal.slice(0,4).forEach(e=>console.log("  "+e.slice(0,200)));
  process.exit(ok && fatal.length===0 ? 0 : 1);
}
main().catch(async e=>{console.error("FATAL",e);for(const k of kids)try{k.kill()}catch(_){};process.exit(2);});
