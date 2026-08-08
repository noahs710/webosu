// Verify the game frame-timing perf HUD works on the BUILT dist/ (vite preview),
// since the user may run the deployed/built site on the 2015 laptop.
// Run: npm run build && node scripts/headless-perf-hud-dist.js
const { spawn } = require("child_process");
const { chromium } = require("playwright");
const SET = 2006909;
const preview = spawn(process.execPath, ["node_modules/vite/bin/vite.js","preview","--port","5302","--strictPort"], { stdio:["ignore","pipe","pipe"] });
const kids=[preview]; let ve=""; preview.stderr.on("data",d=>ve+=d);
async function wait(u,ms=20000){const t0=Date.now();while(Date.now()-t0<ms){try{const r=await fetch(u);if(r.status<500)return true;}catch(e){}await new Promise(r=>setTimeout(r,200));}return false;}
async function main(){
  if(!(await wait("http://localhost:5302/index-v2.html"))){console.log("vite preview not ready",ve);process.exit(1);}
  const b=await chromium.launch({headless:true, args:["--use-gl=swiftshader","--enable-webgl","--autoplay-policy=no-user-gesture-required"]});
  const p=await b.newPage({viewport:{width:1280,height:720}});
  const errs=[]; p.on("pageerror",e=>errs.push(String(e)));
  await p.goto("http://localhost:5302/index-v2.html?perf=1",{waitUntil:"load",timeout:30000});
  await p.evaluate(()=>window.__ensureGame && window.__ensureGame()).catch(()=>{});
  await p.waitForFunction(()=>window.skinReady && window.soundReady, null,{timeout:20000}).catch(()=>{});
  await p.evaluate(()=>{ if(window.game){ window.game.autoplay=true; window.game.autofullscreen=false; } });
  const lr = await p.evaluate(async (set)=>{ try { const r=await fetch("https://catboy.best/d/"+set+"n"); const ab=await (await r.blob()).arrayBuffer(); window.__osublob=new Blob([ab]); window.launchGame(window.__osublob,4174364,"Lightspeed"); return {fetched:window.__osublob.size}; } catch(e){ return {err:String(e)}; } }, SET);
  await p.waitForFunction(()=>!!window.playback, null,{timeout:20000}).catch(()=>{});
  await p.waitForTimeout(4000);
  const hud = await p.evaluate(()=>{ const el=document.getElementById("perf-hud"); return el ? { display: getComputedStyle(el).display, text: el.textContent.replace(/\s+/g," ").slice(0,140) } : null; });
  console.log("=== perf HUD (built dist/, ?perf=1) ==="); console.log("  ", JSON.stringify(hud));
  const ok = hud && hud.display === "block" && /FPS/.test(hud.text) && /p95/.test(hud.text);
  console.log("perf HUD on dist visible + shows FPS/p95:", ok);
  await b.close(); for(const k of kids)try{k.kill("SIGTERM")}catch(e){}
  const fatal=errs.filter(e=>!/catboy|api\/|500|network/i.test(e));
  console.log("fatal:", fatal.length);
  process.exit(ok && fatal.length===0 ? 0 : 1);
}
main().catch(async e=>{console.error("FATAL",e);for(const k of kids)try{k.kill()}catch(_){};process.exit(2);});
