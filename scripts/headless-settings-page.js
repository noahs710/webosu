// Headless verify the Vue settings page: renders controls bound to gamesettings.
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
  await p.goto("http://localhost:5195/settings",{waitUntil:"networkidle",timeout:30000});
  await p.waitForFunction(()=>!!window.gamesettings && document.querySelector("input[type=range]"), null,{timeout:15000});
  const info = await p.evaluate(()=>{
    const ranges = document.querySelectorAll("input[type=range]");
    const checkboxes = document.querySelectorAll("input[type=checkbox]");
    const buttons = document.querySelectorAll("button");
    return {
      hasGamesettings: !!window.gamesettings,
      rangeCount: ranges.length,
      checkboxCount: checkboxes.length,
      buttonCount: buttons.length,
      dimValue: window.gamesettings.dim,
      hasResetButton: [...buttons].some(b=>b.textContent.includes("Reset")),
    };
  });
  console.log("=== settings (Vue) ===");
  console.log("  gamesettings:", info.hasGamesettings, "dim:", info.dimValue);
  console.log("  ranges:", info.rangeCount, "checkboxes:", info.checkboxCount, "buttons:", info.buttonCount);
  console.log("  has reset button:", info.hasResetButton);
  console.log("  pageerrors:", errs.length);
  await b.close(); for(const k of kids)try{k.kill("SIGTERM")}catch(e){}
  const ok = info.hasGamesettings && info.rangeCount >= 7 && info.checkboxCount >= 10 && info.hasResetButton && errs.length === 0;
  console.log("\nSETTINGS PAGE OK:", ok);
  process.exit(ok?0:1);
}
main().catch(async e=>{console.error(e);for(const k of kids)try{k.kill()}catch(_){};process.exit(2);});
