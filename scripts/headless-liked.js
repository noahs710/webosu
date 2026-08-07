// Headless verify liked-v2 + history-v2: seed localforage, confirm beatmap cards render;
// and the empty case shows the empty message.
const { spawn } = require("child_process");
const { chromium } = require("playwright");
const vite=spawn(process.execPath,["node_modules/vite/bin/vite.js","--port","5191","--strictPort"],{stdio:["ignore","pipe","pipe"]});
const kids=[vite];
async function wait(u,ms=20000){const t0=Date.now();while(Date.now()-t0<ms){try{const r=await fetch(u);if(r.status<500)return true;}catch(e){}await new Promise(r=>setTimeout(r,200));}return false;}
async function main(){
  if(!(await wait("http://localhost:5191/liked-v2.html"))){process.exit(1);}
  const b=await chromium.launch({headless:true});
  const p=await b.newPage({viewport:{width:1280,height:800}});
  const errs=[]; p.on("pageerror",e=>errs.push(String(e)));
  // seed favorites with a known sid, then load liked-v2
  await p.goto("http://localhost:5191/liked-v2.html",{waitUntil:"load",timeout:30000});
  await p.evaluate(async ()=>{ await localforage.setItem("likedsidset", new Set([2006909])); });
  await p.reload({waitUntil:"load"});
  await p.waitForFunction(()=>document.querySelectorAll(".beatmap-card").length>0, null,{timeout:20000});
  const favTitle = await p.evaluate(()=>document.querySelector(".beatmap-card .beatmapcard-title")?.textContent);
  const favCount = await p.evaluate(()=>document.querySelectorAll(".beatmap-card").length);
  // empty case
  await p.evaluate(async ()=>{ await localforage.removeItem("likedsidset"); });
  await p.reload({waitUntil:"load"});
  await p.waitForTimeout(800);
  const emptyShown = await p.evaluate(()=>{ const e=document.getElementById("empty"); return e && !e.hidden; });
  // history-v2: seed playhistory1000
  await p.evaluate(async ()=>{ await localforage.setItem("playhistory1000", [{sid:2006909},{sid:2006909},{sid:999999}]); });
  await p.goto("http://localhost:5191/history-v2.html",{waitUntil:"load",timeout:30000});
  await p.waitForFunction(()=>document.querySelectorAll(".beatmap-card").length>0, null,{timeout:20000});
  const histTitle = await p.evaluate(()=>document.querySelector(".beatmap-card .beatmapcard-title")?.textContent);
  const histCount = await p.evaluate(()=>document.querySelectorAll(".beatmap-card").length);
  console.log("=== liked-v2 / history-v2 ===");
  console.log("  favorites card:", favCount, "card(s), first:", favTitle);
  console.log("  favorites empty case shown:", emptyShown);
  console.log("  history card:", histCount, "card(s), first:", histTitle);
  console.log("  pageerrors:", errs.length); errs.slice(0,5).forEach(e=>console.log("    "+e));
  await b.close(); for(const k of kids)try{k.kill("SIGTERM")}catch(e){}
  const ok = favCount>=1 && favTitle && emptyShown===true && histCount>=1 && histTitle && errs.length===0;
  console.log("\nLIKED/HISTORY E2E OK:", ok);
  process.exit(ok?0:1);
}
main().catch(async e=>{console.error(e);for(const k of kids)try{k.kill()}catch(_){};process.exit(2);});
