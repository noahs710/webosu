// Headless: exercise the pause() btn_continue path (the strict-mode ReferenceError
// crash). pause() only assigns btn_continue when osu.audio.pause() returns true,
// so mock it to true + call pause() + verify the menu shows + no ReferenceError.
// Catches the pause-crash regression. Run: node scripts/headless-pause-crash.js (dev)
const { spawn } = require("child_process");
const { chromium } = require("playwright");
const SET = 2006909;
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js","--port","5203","--strictPort"], { stdio:["ignore","pipe","pipe"] });
const kids=[vite]; let ve=""; vite.stderr.on("data",d=>ve+=d);
async function wait(u,ms=20000){const t0=Date.now();while(Date.now()-t0<ms){try{const r=await fetch(u);if(r.status<500)return true;}catch(e){}await new Promise(r=>setTimeout(r,200));}return false;}
async function main(){
  if(!(await wait("http://localhost:5203/index-v2.html"))){console.log("vite not ready",ve);process.exit(1);}
  const b=await chromium.launch({headless:true, args:["--use-gl=swiftshader","--enable-webgl","--autoplay-policy=no-user-gesture-required"]});
  const p=await b.newPage({viewport:{width:1280,height:720}});
  const errs=[]; p.on("pageerror",e=>errs.push(String(e)));
  await p.goto("http://localhost:5203/index-v2.html",{waitUntil:"load",timeout:30000});
  await p.evaluate(()=>window.__ensureGame && window.__ensureGame()).catch(()=>{});
  await p.waitForFunction(()=>window.skinReady && window.soundReady, null,{timeout:20000}).catch(()=>{});
  await p.evaluate(()=>{ if(window.game){ window.game.autoplay=true; window.game.autofullscreen=false; } });
  await p.evaluate(async (set)=>{ const r=await fetch("https://catboy.best/d/"+set+"n"); const ab=await (await r.blob()).arrayBuffer(); window.__osublob=new Blob([ab]); window.launchGame(window.__osublob,4174364,"Lightspeed"); }, SET);
  await p.waitForFunction(()=>!!window.playback && !!window.playback.osu && !!window.playback.osu.audio, null,{timeout:20000}).catch(()=>{});
  // mock audio.pause() to return true so pause() runs the btn_continue block
  const r = await p.evaluate(() => {
    try {
      if (!window.playback || !window.playback.osu || !window.playback.osu.audio) return { ok: false, err: "no playback/audio" };
      window.playback.osu.audio.pause = function () { return true; };
      window.playback.pause();
      const menu = document.getElementById("pause-menu");
      return { ok: true, paused: !!(window.game && window.game.paused), menuHidden: menu ? menu.hasAttribute("hidden") : null };
    } catch (e) { return { ok: false, err: String(e) }; }
  });
  console.log("=== pause() (mocked audio.pause->true) ==="); console.log("  ", JSON.stringify(r));
  const ok = r && r.ok && r.paused === true && r.menuHidden === false;
  console.log("pause() works (no ReferenceError, menu shows):", ok);
  await b.close(); for(const k of kids)try{k.kill("SIGTERM")}catch(e){}
  const fatal=errs.filter(e=>!/catboy|api\/|500|network/i.test(e));
  console.log("fatal:", fatal.length);
  process.exit(ok && fatal.length===0 ? 0 : 1);
}
main().catch(async e=>{console.error("FATAL",e);for(const k of kids)try{k.kill()}catch(_){};process.exit(2);});
