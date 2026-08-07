const { spawn } = require("child_process");
const { chromium } = require("playwright");
const os=require("os"),path=require("path"),fs=require("fs");
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"webosu-lb2-"));
const be=spawn(process.execPath,["server/index.js"],{env:{...process.env,PORT:"8080",DATA_DIR:tmp,DB_PATH:path.join(tmp,"lb.db"),JWT_SECRET:"lb"},stdio:["ignore","pipe","pipe"]});
const vite=spawn(process.execPath,["node_modules/vite/bin/vite.js","--port","5187","--strictPort"],{stdio:["ignore","pipe","pipe"]});
const kids=[be,vite]; let err=""; [be,vite].forEach(k=>k.stderr.on("data",d=>err+=d));
async function wait(u,ms=25000){const t0=Date.now();while(Date.now()-t0<ms){try{const r=await fetch(u);if(r.status<500)return true;}catch(e){}await new Promise(r=>setTimeout(r,200));}return false;}
async function main(){
  if(!(await wait("http://localhost:8080/api/health"))||!(await wait("http://localhost:5187/leaderboard-v2.html"))){console.log("not ready",err);for(const k of kids)try{k.kill()}catch(e){};process.exit(1);}
  const b=await chromium.launch({headless:true});
  const p=await b.newPage({viewport:{width:1280,height:800}});
  const errs=[]; p.on("pageerror",e=>errs.push(String(e)));
  await p.goto("http://localhost:5187/leaderboard-v2.html?bid=4174364",{waitUntil:"load",timeout:30000});
  await p.waitForFunction(()=>!!window.WebosuAPI, null,{timeout:10000}).catch(()=>{});
  const submitted = await p.evaluate(async ()=>{
    await window.WebosuAPI.register("lbtest","pw123456");
    return await window.WebosuAPI.submitScore({ beatmap_id:4174364, beatmap_set_id:2006909, title:"Accelerate", artist:"Teminite", version:"Lightspeed",
      score:123456, combo:600, acc:98.5, grade:"S", count300:100, count100:0, count50:0, miss:0 });
  });
  await p.evaluate(()=>{ const b=document.getElementById("board"); if(b) b._load(); });
  await p.waitForFunction(()=>{
    const el = document.querySelector("leaderboard-board");
    const sr = el && el.shadowRoot;
    return sr && sr.querySelector("tbody tr") !== null;
  }, null, {timeout:10000}).catch(()=>{});
  const rows = await p.evaluate(()=>{
    const sr = document.querySelector("leaderboard-board").shadowRoot;
    const trs = sr ? [...sr.querySelectorAll("tbody tr")] : [];
    return trs.map(tr => [...tr.querySelectorAll("td")].map(td => td.textContent.trim()));
  });
  console.log("submit ok:", !!(submitted && submitted.ok));
  console.log("=== leaderboard rows ===");
  rows.forEach(r => console.log("  " + r.join(" | ")));
  const hasLbtest = rows.some(r => r[1] === "lbtest");
  const hasScore = rows.some(r => r[2] === "123,456");
  console.log("has lbtest:", hasLbtest, "| has 123,456:", hasScore, "| pageerrors:", errs.length);
  await b.close(); for(const k of kids)try{k.kill("SIGTERM")}catch(e){}
  const ok = submitted && submitted.ok && hasLbtest && hasScore && errs.length === 0;
  console.log("\nLEADERBOARD E2E OK:", ok);
  process.exit(ok?0:1);
}
main().catch(async e=>{console.error(e);for(const k of kids)try{k.kill()}catch(_){};process.exit(2);});
