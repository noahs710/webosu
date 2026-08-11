// Verify mod incompatibility pruning: selecting conflicting combos leaves only
// the last-selected mod in each conflict pair.
const { spawn } = require("child_process");
const { chromium } = require("playwright");
const vite=spawn(process.execPath,["node_modules/vite/bin/vite.js","--port","5200","--strictPort"],{stdio:["ignore","pipe","pipe"]});
const kids=[vite];
async function wait(u,ms=20000){const t0=Date.now();while(Date.now()-t0<ms){try{const r=await fetch(u);if(r.status<500)return true;}catch(e){}await new Promise(r=>setTimeout(r,200));}return false;}
async function main(){
  if(!(await wait("http://localhost:5200/browse"))){process.exit(1);}
  const b=await chromium.launch({headless:true, args:["--autoplay-policy=no-user-gesture-required","--use-gl=swiftshader","--enable-webgl"]});
  const p=await b.newPage({viewport:{width:1280,height:720}});
  const errs=[]; p.on("pageerror",e=>errs.push(String(e)));
  await p.goto("http://localhost:5200/browse",{waitUntil:"load",timeout:30000});
  await p.waitForFunction(()=>typeof window.__ensureGame==="function", null, {timeout:15000}).catch(()=>{});
  await p.evaluate(()=>window.__ensureGame && window.__ensureGame()).catch(()=>{});
  await p.waitForFunction(()=>window.ModRegistry, null, {timeout:20000}).catch(()=>{});
  const st = await p.evaluate(()=>{
    const R = window.ModRegistry;
    const cases = [];
    R.setActive(["HR","EZ"]);
    cases.push({ name: "HR then EZ", active: R.serialize().slice().sort() });
    R.setActive(["EZ","HR"]);
    cases.push({ name: "EZ then HR", active: R.serialize().slice().sort() });
    R.setActive(["DT","HT"]);
    cases.push({ name: "DT then HT", active: R.serialize().slice().sort() });
    R.setActive(["NF","SD"]);
    cases.push({ name: "NF then SD", active: R.serialize().slice().sort() });
    R.setActive(["NF","PF"]);
    cases.push({ name: "NF then PF", active: R.serialize().slice().sort() });
    R.setActive(["SD","PF"]);
    cases.push({ name: "SD then PF", active: R.serialize().slice().sort() });
    R.setActive(["AT","RX","AP"]);
    cases.push({ name: "AT RX AP", active: R.serialize().slice().sort() });
    return cases;
  });
  console.log("=== Mod Incompatibility ===");
  for (const c of st) console.log(c.name, "=", JSON.stringify(c.active));
  console.log("pageerrors:", errs.length);
  if (errs.length) console.log("errors:", errs.slice(0,5));
  await b.close(); for(const k of kids)try{k.kill("SIGTERM")}catch(e){}
  const expected = {
    "HR then EZ": ["EZ"],
    "EZ then HR": ["HR"],
    "DT then HT": ["HT"],
    "NF then SD": ["SD"],
    "NF then PF": ["PF"],
    "SD then PF": ["PF"],
    "AT RX AP": ["AP"],
  };
  const ok = st.every(c => JSON.stringify(c.active) === JSON.stringify(expected[c.name])) && errs.length===0;
  console.log("\nINCOMPATIBILITY OK:", ok);
  process.exit(ok?0:1);
}
main().catch(async e=>{console.error(e);for(const k of kids)try{k.kill()}catch(_){};process.exit(2);});
