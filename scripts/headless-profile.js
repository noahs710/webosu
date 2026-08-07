const { spawn } = require("child_process");
const { chromium } = require("playwright");
const os=require("os"),path=require("path"),fs=require("fs");
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"webosu-prof-"));
const be=spawn(process.execPath,["server/index.js"],{env:{...process.env,PORT:"8080",DATA_DIR:tmp,DB_PATH:path.join(tmp,"p.db"),JWT_SECRET:"p"},stdio:["ignore","pipe","pipe"]});
const vite=spawn(process.execPath,["node_modules/vite/bin/vite.js","--port","5190","--strictPort"],{stdio:["ignore","pipe","pipe"]});
const kids=[be,vite]; let err=""; [be,vite].forEach(k=>k.stderr.on("data",d=>err+=d));
async function wait(u,ms=25000){const t0=Date.now();while(Date.now()-t0<ms){try{const r=await fetch(u);if(r.status<500)return true;}catch(e){}await new Promise(r=>setTimeout(r,200));}return false;}
async function main(){
  if(!(await wait("http://localhost:8080/api/health"))||!(await wait("http://localhost:5190/profile-v2.html"))){console.log("not ready",err);for(const k of kids)try{k.kill()}catch(e){};process.exit(1);}
  const b=await chromium.launch({headless:true});
  const p=await b.newPage({viewport:{width:1280,height:800}});
  const errs=[]; p.on("pageerror",e=>errs.push(String(e)));
  // register + submit 2 scores on the profile page (it loads the api via account-widget)
  await p.goto("http://localhost:5190/profile-v2.html",{waitUntil:"load",timeout:30000});
  await p.waitForFunction(()=>!!window.WebosuAPI, null,{timeout:10000}).catch(()=>{});
  await p.evaluate(async ()=>{
    await window.WebosuAPI.register("profiletest","pw123456");
    await window.WebosuAPI.submitScore({ beatmap_id:111, beatmap_set_id:1, title:"A", artist:"x", version:"H",
      score:500000, combo:500, acc:99, grade:"S", count300:500, count100:0, count50:0, miss:0 });
    await window.WebosuAPI.submitScore({ beatmap_id:222, beatmap_set_id:2, title:"B", artist:"y", version:"I",
      score:900000, combo:700, acc:98, grade:"A", count300:600, count100:5, count50:0, miss:0 });
  });
  // now load the profile for profiletest
  await p.goto("http://localhost:5190/profile-v2.html?u=profiletest",{waitUntil:"load",timeout:30000});
  await p.waitForFunction(()=>{
    const el=document.querySelector("profile-card"); const sr=el&&el.shadowRoot;
    return sr && sr.querySelector(".stat .v");
  }, null,{timeout:12000}).catch(()=>{});
  const data = await p.evaluate(()=>{
    const sr=document.querySelector("profile-card").shadowRoot;
    const get = (sel) => { const e=sr.querySelector(sel); return e?e.textContent.trim():null; };
    return {
      username: get("h2"),
      plays: [...sr.querySelectorAll(".stat")].find(s=>s.querySelector(".k")&&s.querySelector(".k").textContent==="Plays")?.querySelector(".v").textContent,
      maxScore: [...sr.querySelectorAll(".stat")].find(s=>s.querySelector(".k")&&s.querySelector(".k").textContent==="Max score")?.querySelector(".v").textContent,
      avgAcc: [...sr.querySelectorAll(".stat")].find(s=>s.querySelector(".k")&&s.querySelector(".k").textContent==="Avg acc")?.querySelector(".v").textContent,
      badges: [...sr.querySelectorAll(".badge")].map(b=>b.textContent.trim()),
    };
  });
  console.log("=== profile-v2 ==="); console.log(JSON.stringify(data, null, 2));
  console.log("pageerrors:", errs.length);
  await b.close(); for(const k of kids)try{k.kill("SIGTERM")}catch(e){}
  const ok = data.username==="profiletest" && data.plays==="2" && data.maxScore==="900,000" && data.badges.includes("first_fc") && errs.length===0;
  console.log("\nPROFILE E2E OK:", ok);
  process.exit(ok?0:1);
}
main().catch(async e=>{console.error(e);for(const k of kids)try{k.kill()}catch(_){};process.exit(2);});
