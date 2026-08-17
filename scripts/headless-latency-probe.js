// headless-latency-probe.js — measures input-to-judgement latency in headless.
// For each synthetic click at a known time, records the wall-time until the
// judgement sprite is spawned. Reports P50/P95.
// Run: node scripts/headless-latency-probe.js
const { spawn } = require("child_process");
const { chromium } = require("playwright");
const SET = 2006909, BID = 4174364;
async function wait(url, ms=25000){const t0=Date.now();while(Date.now()-t0<ms){try{const r=await fetch(url);if(r.status<500)return true;}catch(e){}await new Promise(r=>setTimeout(r,250));}return false;}
async function main(){
  const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js","--port","5371","--strictPort"], {stdio:["ignore","pipe","pipe"]});
  if (!await wait("http://localhost:5371/browse")) { console.log("vite not ready"); process.exit(1); }
  const b = await chromium.launch({headless:true, args:["--use-gl=swiftshader","--enable-webgl"]});
  const p = await b.newPage({viewport:{width:1280,height:720}});
  await p.goto("http://localhost:5371/browse",{waitUntil:"load",timeout:30000});
  await p.waitForFunction(()=>typeof window.__ensureGame==="function",null,{timeout:15000}).catch(()=>{});
  await p.evaluate(()=>window.__ensureGame&&window.__ensureGame()).catch(()=>{});
  await p.waitForFunction(()=>window.skinReady,null,{timeout:25000}).catch(()=>{});
  // Launch a tiny beatmap and measure judgement spawn
  const t0 = performance.now();
  await p.evaluate(async (SET)=>{ window.__judgeMarks=[]; const origHit = window.Playback && window.Playback.prototype && window.Playback.prototype.hitSuccess; if(origHit){ window.Playback.prototype.hitSuccess = function(hit,points,time){ window.__judgeMarks.push(performance.now()); return origHit.call(this,hit,points,time); }; } const r=await fetch("https://catboy.best/d/"+SET+"n"); const ab=await(await r.blob()).arrayBuffer(); window.game.autoplay=false; window.launchGame(new Blob([ab]),4174364,"Lightspeed"); }, SET);
  await p.waitForFunction(()=>window.playback&&window.playback.osu&&window.playback.osu.audio,null,{timeout:25000}).catch(()=>{});
  // Synthesize a click at a known time and measure
  const latencies = [];
  for(let i=0;i<5;i++){
    const before = await p.evaluate(()=>performance.now());
    await p.evaluate(()=>{ if(window.playback&&window.playback.game){ window.playback.game.down=true; if(window.playback._playerActions) window.playback._playerActions.checkClickdown && window.playback._playerActions.checkClickdown(); } });
    await p.waitForTimeout(100);
    const after = await p.evaluate(()=> window.__judgeMarks && window.__judgeMarks.length ? window.__judgeMarks[window.__judgeMarks.length-1] : null);
    if(after) latencies.push(after - before);
    await p.evaluate(()=>{ if(window.playback&&window.playback.game) window.playback.game.down=false; });
    await p.waitForTimeout(200);
  }
  latencies.sort((a,b)=>a-b);
  const p50 = latencies[Math.floor(latencies.length*0.5)] || 0;
  const p95 = latencies[Math.floor(latencies.length*0.95)] || latencies[latencies.length-1] || 0;
  console.log(`latency: P50 ${p50.toFixed(1)}ms P95 ${p95.toFixed(1)}ms (n=${latencies.length})`);
  console.log(JSON.stringify({p50,p95,latencies},null,2));
  // Do not fail on high latency in headless — just report
  await b.close(); vite.kill(); process.exit(0);
}
main().catch(e=>{console.error(e);process.exit(1);});
