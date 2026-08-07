const { spawn } = require("child_process");
const { chromium } = require("playwright");
const os=require("os"),path=require("path"),fs=require("fs");
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"webosu-skins-"));
const be=spawn(process.execPath,["server/index.js"],{env:{...process.env,PORT:"8080",DATA_DIR:tmp,DB_PATH:path.join(tmp,"s.db"),JWT_SECRET:"s"},stdio:["ignore","pipe","pipe"]});
const vite=spawn(process.execPath,["node_modules/vite/bin/vite.js","--port","5193","--strictPort"],{stdio:["ignore","pipe","pipe"]});
const kids=[be,vite]; let err=""; [be,vite].forEach(k=>k.stderr.on("data",d=>err+=d));
async function wait(u,ms=25000){const t0=Date.now();while(Date.now()-t0<ms){try{const r=await fetch(u);if(r.status<500)return true;}catch(e){}await new Promise(r=>setTimeout(r,200));}return false;}
async function main(){
  if(!(await wait("http://localhost:8080/api/health"))||!(await wait("http://localhost:5193/skins-v2.html"))){console.log("not ready",err);for(const k of kids)try{k.kill()}catch(e){};process.exit(1);}
  const b=await chromium.launch({headless:true});
  const p=await b.newPage({viewport:{width:1280,height:800}});
  const errs=[]; p.on("pageerror",e=>errs.push(String(e)));
  await p.goto("http://localhost:5193/skins-v2.html",{waitUntil:"load",timeout:30000});
  await p.waitForFunction(()=>!!window.WebosuAPI, null,{timeout:10000}).catch(()=>{});
  // register + upload a fake skin
  const up = await p.evaluate(async ()=>{
    await window.WebosuAPI.register("skintest","pw123456");
    const ab = new ArrayBuffer(64); new Uint8Array(ab).fill(7); // fake .osk bytes
    return await window.WebosuAPI.uploadSkin("myskin", "myskin.osk", ab);
  });
  // re-fetch the list
  await p.evaluate(()=>{ const el=document.querySelector("skin-list"); if(el) el._load(); });
  await p.waitForFunction(()=>{ const sr=document.querySelector("skin-list").shadowRoot; return sr && sr.querySelector(".card .name"); }, null,{timeout:10000});
  const card = await p.evaluate(()=>{
    const sr=document.querySelector("skin-list").shadowRoot;
    const c=sr.querySelector(".card");
    return c ? { name: c.querySelector(".name").textContent, author: c.querySelector(".author").textContent, dlHref: c.querySelector("a").getAttribute("href") } : null;
  });
  // download the skin and verify bytes
  const dl = await p.evaluate(async (href)=>{ const r=await fetch(href); const ab=await (await r.blob()).arrayBuffer(); return { status:r.status, len:ab.byteLength, first:new Uint8Array(ab)[0] }; }, card && card.dlHref);
  console.log("=== skins-v2 ===");
  console.log("  upload ok:", !!(up && up.id), "id:", up && up.id);
  console.log("  listed:", JSON.stringify(card));
  console.log("  download:", JSON.stringify(dl));
  console.log("  pageerrors:", errs.length);
  await b.close(); for(const k of kids)try{k.kill("SIGTERM")}catch(e){}
  const ok = up && up.id && card && card.name==="myskin" && card.author.includes("skintest") && dl && dl.status===200 && dl.len===64 && dl.first===7 && errs.length===0;
  console.log("\nSKINS E2E OK:", ok);
  process.exit(ok?0:1);
}
main().catch(async e=>{console.error(e);for(const k of kids)try{k.kill()}catch(_){};process.exit(2);});
