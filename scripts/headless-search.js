const { spawn } = require("child_process");
const { chromium } = require("playwright");
const vite=spawn(process.execPath,["node_modules/vite/bin/vite.js","--port","5189","--strictPort"],{stdio:["ignore","pipe","pipe"]});
const kids=[vite];
async function wait(u,ms=20000){const t0=Date.now();while(Date.now()-t0<ms){try{const r=await fetch(u);if(r.status<500)return true;}catch(e){}await new Promise(r=>setTimeout(r,200));}return false;}
const firstTitle = (p) => p.evaluate(()=>{ const c=document.querySelector(".beatmap-card .beatmapcard-title"); return c?c.textContent:null; });
const cardCount = (p) => p.evaluate(()=>document.querySelectorAll(".beatmap-card").length);
async function main(){
  if(!(await wait("http://localhost:5189/search-v2.html"))){process.exit(1);}
  const b=await chromium.launch({headless:true});
  const p=await b.newPage({viewport:{width:1280,height:800}});
  const errs=[]; p.on("pageerror",e=>errs.push(String(e)));
  await p.goto("http://localhost:5189/search-v2.html?q=accelerate",{waitUntil:"load",timeout:30000});
  await p.waitForFunction(()=>document.querySelectorAll(".beatmap-card").length>0, null,{timeout:20000});
  const t1 = await firstTitle(p); const n1 = await cardCount(p);
  await p.fill("#q", "freedom dive");
  await p.evaluate(()=>document.getElementById("searchform").dispatchEvent(new Event("submit", {cancelable:true})));
  await p.waitForFunction((prev)=>{ const t=document.querySelector(".beatmap-card .beatmapcard-title"); return t && t.textContent !== prev; }, t1, {timeout:20000});
  const t2 = await firstTitle(p); const n2 = await cardCount(p);
  console.log("=== search-v2 ===");
  console.log("  initial (accelerate):", n1, "cards, first:", t1);
  console.log("  after submit (freedom dive):", n2, "cards, first:", t2);
  console.log("  changed:", t1 !== t2, "| pageerrors:", errs.length);
  await b.close(); for(const k of kids)try{k.kill("SIGTERM")}catch(e){}
  const ok = n1>0 && n2>0 && t1 !== t2 && errs.length===0;
  console.log("\nSEARCH E2E OK:", ok);
  process.exit(ok?0:1);
}
main().catch(async e=>{console.error(e);for(const k of kids)try{k.kill()}catch(_){};process.exit(2);});
