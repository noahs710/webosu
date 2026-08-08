const { spawn } = require("child_process");
const { chromium } = require("playwright");
const SET = 2006909;
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js","--port","5192","--strictPort"], { stdio:["ignore","pipe","pipe"] });
const kids=[vite]; let ve=""; vite.stderr.on("data",d=>ve+=d);
async function wait(u,ms=20000){const t0=Date.now();while(Date.now()-t0<ms){try{const r=await fetch(u);if(r.status<500)return true;}catch(e){}await new Promise(r=>setTimeout(r,200));}return false;}
async function main(){
  if(!(await wait("http://localhost:5192/index-v2.html"))){console.log("vite not ready",ve);process.exit(1);}
  const b=await chromium.launch({headless:true, args:["--use-gl=swiftshader","--enable-webgl","--autoplay-policy=no-user-gesture-required"]});
  const p=await b.newPage({viewport:{width:1280,height:720}});
  const errs=[]; p.on("pageerror",e=>errs.push(String(e)));
  const logs=[]; p.on("console",m=>{ if(/webosu v8 perf/.test(m.text())) logs.push(m.text()); });
  await p.goto("http://localhost:5192/index-v2.html?perf=1",{waitUntil:"load",timeout:30000});
  await p.waitForFunction(()=>typeof window.launchGame==="function" && window.skinReady && window.soundReady, null,{timeout:20000}).catch(()=>{});
  await p.evaluate(()=>{ if(window.game){ window.game.autoplay=true; window.game.autofullscreen=false; } });
  await p.evaluate(async (set)=>{ const r=await fetch("https://catboy.best/d/"+set+"n"); const ab=await (await r.blob()).arrayBuffer(); window.__osublob=new Blob([ab]); window.launchGame(window.__osublob,4174364,"Lightspeed"); }, SET);
  await p.waitForFunction(()=>!!window.playback, null,{timeout:20000}).catch(()=>{});
  await p.waitForTimeout(4000);
  const hud = await p.evaluate(()=>{ const el=document.getElementById("perf-hud"); return el ? { display: getComputedStyle(el).display, text: el.textContent.replace(/\s+/g," ").slice(0,120) } : null; });
  // press F4 to copy/log the perf summary
  await p.keyboard.press("F4");
  await p.waitForTimeout(300);
  const f4 = await p.evaluate(()=>({ sum: window.__perfSummary || null }));
  console.log("=== perf HUD ==="); console.log("  ", JSON.stringify(hud));
  console.log("  F4 -> window.__perfSummary:", f4.sum);
  console.log("  F4 console log captured:", logs.length > 0, logs[0] ? logs[0].slice(0,100) : "");
  const ok = hud && hud.display === "block" && /FPS/.test(hud.text) && /p95/.test(hud.text) && !!f4.sum && /webosu v8 perf/.test(f4.sum) && logs.length > 0;
  console.log("perf HUD visible + shows FPS/p95:", ok);
  await b.close(); for(const k of kids)try{k.kill("SIGTERM")}catch(e){}
  const fatal=errs.filter(e=>!/catboy|api\/|500|network/i.test(e));
  console.log("fatal:", fatal.length); fatal.slice(0,4).forEach(e=>console.log("  "+e.slice(0,180)));
  process.exit(ok && fatal.length===0 ? 0 : 1);
}
main().catch(async e=>{console.error("FATAL",e);for(const k of kids)try{k.kill()}catch(_){};process.exit(2);});
