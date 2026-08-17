// Headless regression test for burst-miss-on-first-tap.
// Loads a map, waits for audio ready, triggers a retry, then asserts that no
// burst misses fire (judgecnt.miss === 0 and not failed) within the first 2s.
// Reproduces the bug where the scrub guard was disabled during the negative
// lead-in time, causing ~11 misses on the first frame after audio start.
// Run: node scripts/headless-burst-miss.js (dev)
const { spawn } = require("child_process");
const { chromium } = require("playwright");
const SET = 2006909;
const BID = 4174364;
const VER = "Lightspeed";
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js","--port","5215","--strictPort"], { stdio:["ignore","pipe","pipe"] });
const kids=[vite]; let ve=""; vite.stderr.on("data",d=>ve+=d);
async function wait(u,ms=20000){const t0=Date.now();while(Date.now()-t0<ms){try{const r=await fetch(u);if(r.status<500)return true;}catch(e){}await new Promise(r=>setTimeout(r,200));}return false;}
async function main(){
  if(!(await wait("http://localhost:5215/browse"))){console.log("vite not ready",ve);process.exit(1);}
  const b=await chromium.launch({headless:true, args:["--use-gl=swiftshader","--enable-webgl","--autoplay-policy=no-user-gesture-required"]});
  const p=await b.newPage({viewport:{width:1280,height:720}});
  const errs=[]; p.on("pageerror",e=>errs.push(String(e)));
  p.on("console",m=>{if(m.type()==="error" && !/catboy|api\/activity|500/.test(m.text())) console.log("CONSOLE-ERR:",m.text().slice(0,160))});
  await p.goto("http://localhost:5215/browse",{waitUntil:"load",timeout:30000});
  await p.waitForFunction(()=>typeof window.__ensureGame==="function", null, {timeout:15000}).catch(()=>{});
  await p.evaluate(()=>window.__ensureGame && window.__ensureGame()).catch(()=>{});
  await p.waitForFunction(()=>window.skinReady && window.soundReady, null,{timeout:20000}).catch(()=>{});
  // disable autoplay so misses are real; disable fullscreen so headless doesn't block
  await p.evaluate(()=>{ if(window.game){ window.game.autoplay=false; window.game.autofullscreen=false; } });
  await p.evaluate(async (set)=>{ const r=await fetch("https://catboy.best/d/"+set+"n"); const ab=await (await r.blob()).arrayBuffer(); window.__osublob=new Blob([ab]); window.launchGame(window.__osublob,4174364,"Lightspeed"); }, SET);
  await p.waitForFunction(()=>!!window.playback && !!window.playback.osu && !!window.playback.osu.audio && !!window.app, null,{timeout:20000}).catch(()=>{});
  // wait for audio to be ready and the playback to have started
  await p.waitForFunction(()=>!!window.playback && window.playback.audioReady, null,{timeout:20000}).catch(()=>{});
  await p.waitForTimeout(500);

  // Snapshot miss count before retry
  const before = await p.evaluate(()=>({
    miss: window.playback && window.playback.scoreOverlay ? window.playback.scoreOverlay.judgecnt.miss : -1,
    failed: window.playback && window.playback.scoreOverlay ? window.playback.scoreOverlay.failed : null,
    firstHitTime: window.playback && window.playback.hits && window.playback.hits[0] ? window.playback.hits[0].time : null,
    wait: window.playback ? window.playback.wait : null,
  }));
  console.log("=== before retry ===");
  console.log("  miss:", before.miss, "failed:", before.failed, "firstHitTime:", before.firstHitTime, "wait:", before.wait);

  // Trigger retry
  await p.evaluate(()=>{ if(window.playback && window.playback.retry) window.playback.retry(); });
  // Wait 2 seconds for any burst misses to fire
  await p.waitForTimeout(2000);

  // Assert no burst misses and not failed
  const after = await p.evaluate(()=>({
    miss: window.playback && window.playback.scoreOverlay ? window.playback.scoreOverlay.judgecnt.miss : -1,
    failed: window.playback && window.playback.scoreOverlay ? window.playback.scoreOverlay.failed : null,
    ended: window.playback ? window.playback.ended : null,
    hits: window.playback && window.playback.hits ? window.playback.hits.length : 0,
    audioPos: (window.playback && window.playback.osu && window.playback.osu.audio) ? window.playback.osu.audio.getPosition() : -1,
  }));
  console.log("=== after retry (2s) ===");
  console.log("  miss:", after.miss, "failed:", after.failed, "ended:", after.ended, "hits:", after.hits, "audioPos:", after.audioPos);

  const pass = after.miss === 0 && after.failed === false;
  console.log("\n=== RESULT ===");
  console.log(pass ? "PASS: no burst misses after retry" : "FAIL: burst misses detected (miss="+after.miss+", failed="+after.failed+")");

  try { await p.screenshot({path:"scripts/headless-burst-miss.png"}); console.log("screenshot: scripts/headless-burst-miss.png"); } catch(e){}
  await b.close(); for(const k of kids)try{k.kill("SIGTERM")}catch(e){}
  const fatal = errs.filter(e=>!/catboy|api\/activity|500|network/i.test(e));
  console.log("FATAL errors: "+fatal.length);
  process.exit(pass ? 0 : 1);
}
main().catch(async e=>{console.error("FATAL",e);for(const k of kids)try{k.kill()}catch(_){};process.exit(2);});