const { spawn } = require("child_process");
const { chromium } = require("playwright");
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js","--port","5181","--strictPort"], { stdio:["ignore","pipe","pipe"] });
const kids=[vite];
async function wait(u,ms=20000){const t0=Date.now();while(Date.now()-t0<ms){try{const r=await fetch(u);if(r.status<500)return true;}catch(e){}await new Promise(r=>setTimeout(r,200));}return false;}
async function main(){
  if(!(await wait("http://localhost:5181/browse"))){process.exit(1);}
  const b=await chromium.launch({headless:true, args:["--use-gl=swiftshader","--enable-webgl","--autoplay-policy=no-user-gesture-required"]});
  const p=await b.newPage({viewport:{width:1280,height:720}});
  const errs=[]; p.on("pageerror",e=>errs.push(String(e)));
  await p.goto("http://localhost:5181/browse",{waitUntil:"load",timeout:30000});
await p.waitForFunction(()=>typeof window.__ensureGame==="function", null, {timeout:15000}).catch(()=>{});
  await p.evaluate(()=>window.__ensureGame && window.__ensureGame()).catch(()=>{});
  await p.waitForFunction(()=>window.skinReady && window.soundReady, null,{timeout:20000}).catch(()=>{});
  await p.evaluate(()=>{ window.game.autoplay = true; window.game.autofullscreen = false; });
  await p.evaluate(async ()=>{ const r=await fetch("https://catboy.best/d/2006909n"); const ab=await (await r.blob()).arrayBuffer(); window.__osublob=new Blob([ab]); window.launchGame(window.__osublob, 4174364, "Lightspeed"); });
  await p.waitForFunction(()=>!!window.app, null,{timeout:20000}).catch(()=>{});
  await p.waitForTimeout(4000);
  const im = await p.evaluate(()=>{ const im = window.app && window.app.renderer && window.app.renderer.plugins && window.app.renderer.plugins.interaction; return im ? { tickerAdded: im.tickerAdded, useSystemTicker: im._useSystemTicker, hasDOM: !!im.interactionDOMElement } : null; });
  const pb = await p.evaluate(()=>({ app:!!window.app, playback:!!window.playback, hits: window.playback?(window.playback.hits||[]).length:0 }));
  console.log("InteractionManager after launch:", JSON.stringify(im));
  console.log("game:", JSON.stringify(pb));
  console.log("pageerrors:", errs.length, "fatal:", errs.filter(e=>!/catboy|api\/activity|500|fetch|ERR_/i.test(e)).length);
  await b.close(); for(const k of kids)try{k.kill("SIGTERM")}catch(e){}
  process.exit(im && im.tickerAdded === false && pb.hits > 0 && errs.filter(e=>!/catboy|api\/activity|500|fetch|ERR_/i.test(e)).length === 0 ? 0 : 1);
}
main().catch(async e=>{console.error(e);for(const k of kids)try{k.kill()}catch(_){};process.exit(2);});
