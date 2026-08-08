// Headless verify the lit settings page: renders controls bound to gamesettings,
// and editing a slider / toggle updates gamesettings + persists to localStorage.
const { spawn } = require("child_process");
const { chromium } = require("playwright");
const vite=spawn(process.execPath,["node_modules/vite/bin/vite.js","--port","5195","--strictPort"],{stdio:["ignore","pipe","pipe"]});
const kids=[vite];
async function wait(u,ms=20000){const t0=Date.now();while(Date.now()-t0<ms){try{const r=await fetch(u);if(r.status<500)return true;}catch(e){}await new Promise(r=>setTimeout(r,200));}return false;}
async function main(){
  if(!(await wait("http://localhost:5195/settings"))){process.exit(1);}
  const b=await chromium.launch({headless:true});
  const p=await b.newPage({viewport:{width:1280,height:900}});
  const errs=[]; p.on("pageerror",e=>errs.push(String(e)));
  await p.goto("http://localhost:5195/settings",{waitUntil:"load",timeout:30000});
  await p.waitForFunction(()=>!!window.gamesettings && document.querySelector("settings-panel").shadowRoot.querySelector("input[type=range]"), null,{timeout:12000});
  // initial: dim slider reflects default (60)
  const initDim = await p.evaluate(()=>{ const sr=document.querySelector("settings-panel").shadowRoot; const r=[...sr.querySelectorAll("input[type=range]")].find(i=>i.min==="0" && i.max==="100"); return r?r.value:null; });
  // change the dim slider to 40 via gamesettings + event
  await p.evaluate(()=>{ const sr=document.querySelector("settings-panel").shadowRoot; const r=[...sr.querySelectorAll("input[type=range]")].find(i=>i.min==="0" && i.max==="100"); r.value="40"; r.dispatchEvent(new Event("input",{bubbles:true})); });
  const afterDim = await p.evaluate(()=>window.gamesettings.dim);
  const stored = await p.evaluate(()=>JSON.parse(localStorage.getItem("osugamesettings")||"{}").dim);
  // toggle a mod (hardrock)
  await p.evaluate(()=>{ const sr=document.querySelector("settings-panel").shadowRoot; const c=[...sr.querySelectorAll("input[type=checkbox]")].find(i=>i.parentElement.textContent.includes("Hard Rock")); c.checked=true; c.dispatchEvent(new Event("change",{bubbles:true})); });
  const hardrock = await p.evaluate(()=>window.gamesettings.hardrock);
  const storedHr = await p.evaluate(()=>JSON.parse(localStorage.getItem("osugamesettings")||"{}").hardrock);
  console.log("=== settings-v2 ===");
  console.log("  initial dim slider:", initDim);
  console.log("  after slider -> gamesettings.dim:", afterDim, "| stored:", stored);
  console.log("  after toggle -> gamesettings.hardrock:", hardrock, "| stored:", storedHr);
  console.log("  pageerrors:", errs.length);
  await b.close(); for(const k of kids)try{k.kill("SIGTERM")}catch(e){}
  const ok = initDim==="60" && afterDim===40 && stored===40 && hardrock===true && storedHr===true && errs.length===0;
  console.log("\nSETTINGS PAGE OK:", ok);
  process.exit(ok?0:1);
}
main().catch(async e=>{console.error(e);for(const k of kids)try{k.kill()}catch(_){};process.exit(2);});
