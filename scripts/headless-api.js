const { spawn } = require("child_process");
const { chromium } = require("playwright");
const os=require("os"),path=require("path"),fs=require("fs");
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"webosu-api2-"));
const be=spawn(process.execPath,["server/index.js"],{env:{...process.env,PORT:"8080",DATA_DIR:tmp,DB_PATH:path.join(tmp,"api.db"),JWT_SECRET:"api"},stdio:["ignore","pipe","pipe"]});
const vite=spawn(process.execPath,["node_modules/vite/bin/vite.js","--port","5184","--strictPort"],{stdio:["ignore","pipe","pipe"]});
const kids=[be,vite]; let err=""; [be,vite].forEach(k=>k.stderr.on("data",d=>err+=d));
async function wait(u,ms=25000){const t0=Date.now();while(Date.now()-t0<ms){try{const r=await fetch(u);if(r.status<500)return true;}catch(e){}await new Promise(r=>setTimeout(r,200));}return false;}
async function main(){
  if(!(await wait("http://localhost:8080/api/health"))||!(await wait("http://localhost:5184/src/shell/api-probe.html"))){console.log("not ready",err);for(const k of kids)try{k.kill()}catch(e){};process.exit(1);}
  const b=await chromium.launch({headless:true});
  const p=await b.newPage();
  const errs=[]; p.on("pageerror",e=>errs.push(String(e)));
  await p.goto("http://localhost:5184/src/shell/api-probe.html",{waitUntil:"load",timeout:30000});
  let res=null;
  try { await p.waitForFunction(()=>window.__apiResult, null, {timeout:15000}); res = await p.evaluate(()=>window.__apiResult); } catch(e){ res = {error:"timeout"}; }
  console.log("=== ESM api vs backend ==="); console.log(JSON.stringify(res));
  console.log("pageerrors:", errs.length); errs.slice(0,5).forEach(e=>console.log("  "+e));
  await b.close(); for(const k of kids)try{k.kill("SIGTERM")}catch(e){}
  const ok = res && res.register==="shellprobe" && res.loggedIn===true && res.me==="shellprobe" && res.afterLogout===false && typeof res.pp==="number" && errs.length===0;
  console.log("\nAPI ESM OK:", ok);
  process.exit(ok?0:1);
}
main().catch(async e=>{console.error(e);for(const k of kids)try{k.kill()}catch(_){};process.exit(2);});
