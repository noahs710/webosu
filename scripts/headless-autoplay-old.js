// A/B control: run the ORIGINAL AMD game (served verbatim by the Fastify backend,
// no Vite transform) headlessly in autoplay with the same map+flags as the ESM run.
// If it ALSO ends early at ~4s/0 score, the early-end is a headless audio artifact,
// not an ESM-port bug.
const { spawn } = require("child_process");
const { chromium } = require("playwright");
const os=require("os"),path=require("path"),fs=require("fs");
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"webosu-ab-"));
const be=spawn(process.execPath,["server/index.js"],{env:{...process.env,PORT:"8082",DATA_DIR:tmp,DB_PATH:path.join(tmp,"ab.db"),JWT_SECRET:"ab"},stdio:["ignore","pipe","pipe"]});
const kids=[be]; let beErr=""; be.stderr.on("data",d=>beErr+=d);
async function wait(url,ms=20000){const t0=Date.now();while(Date.now()-t0<ms){try{const r=await fetch(url);if(r.status<500)return true;}catch(e){}await new Promise(r=>setTimeout(r,200));}return false;}
async function main(){
  if(!(await wait("http://localhost:8082/index.html"))){console.log("backend not ready",beErr);process.exit(1);}
  const b=await chromium.launch({headless:true, args:["--use-gl=swiftshader","--enable-webgl","--autoplay-policy=no-user-gesture-required"]});
  const p=await b.newPage({viewport:{width:1280,height:720}});
  const errors=[]; p.on("pageerror",e=>errors.push(String(e)));
  p.on("console",m=>{if(m.type()==="error" && !/catboy|api\/activity|500|Failed to fetch/i.test(m.text())) console.log("CONSOLE-ERR:",m.text().slice(0,150))});
  await p.goto("http://localhost:8082/index.html",{waitUntil:"load",timeout:30000});
  await p.waitForFunction(()=>typeof window.launchGame==="function" && window.skinReady && window.soundReady, null,{timeout:25000}).catch(()=>{});
  await p.evaluate(()=>{ window.game.autoplay = true; window.game.autofullscreen = false; });
  console.log("OLD game autoplay set: " + await p.evaluate(()=>window.game.autoplay));
  const lr = await p.evaluate(async ()=>{
    try { const r=await fetch("https://catboy.best/d/2006909n"); const ab=await (await r.blob()).arrayBuffer(); window.__osublob=new Blob([ab]); window.launchGame(window.__osublob, 4174364, "Lightspeed"); return {fetched:window.__osublob.size}; }
    catch(e){ return {evalErr:String(e)}; }
  });
  console.log("launch:", JSON.stringify(lr));
  await p.waitForFunction(()=>!!window.playback && !!window.playback.osu && !!window.playback.osu.audio, null,{timeout:20000}).catch(()=>{});
  await p.evaluate(()=>{ try { window.playback.osu.audio.audio.resume(); } catch(e){} });
  const s0=await sample(); await p.waitForTimeout(10000); const s1=await sample();
  console.log("=== OLD (AMD) autoplay progression ===");
  console.log("  audioPos  ", s0.pos, "->", s1.pos, " advanced="+(s1.pos>s0.pos));
  console.log("  hitIndex  ", s0.idx, "->", s1.idx);
  console.log("  score     ", s0.score, "->", s1.score, " combo", s1.combo, " great/miss", s1.great+"/"+s1.miss);
  console.log("  ended     ", s1.ended, " endTime", s1.endTime, " hitsLen", s1.hitsLen, " lastEnd", s1.lastEnd, " firstTime", s1.firstTime);
  console.log("  pageerrors:", errors.length); errors.slice(0,8).forEach(e=>console.log("    "+e));
  await b.close(); for(const k of kids)try{k.kill("SIGTERM")}catch(e){}
  process.exit(0);
  async function sample(){ return await p.evaluate(()=>{
    const pb=window.playback||{}; const so=pb.scoreOverlay||{};
    return { pos:(pb.osu&&pb.osu.audio)?pb.osu.audio.getPosition():-1, idx:pb.currentHitIndex||0, score:so.score||0, combo:so.combo||0, great:so.judgecnt?so.judgecnt.great:0, miss:so.judgecnt?so.judgecnt.miss:0, ended:!!pb.ended, endTime:pb.endTime||0, hitsLen:pb.hits?pb.hits.length:0, lastEnd:(pb.hits&&pb.hits.length)?pb.hits[pb.hits.length-1].endTime:0, firstTime:(pb.hits&&pb.hits.length)?pb.hits[0].time:0 };
  }); }
}
main().catch(async e=>{console.error("FATAL",e);for(const k of kids)try{k.kill()}catch(_){};process.exit(2);});
