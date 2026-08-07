// Headless verify the lit account-widget: drive the auth modal against the backend.
const { spawn } = require("child_process");
const { chromium } = require("playwright");
const os=require("os"),path=require("path"),fs=require("fs");
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"webosu-acct-"));
const be=spawn(process.execPath,["server/index.js"],{env:{...process.env,PORT:"8080",DATA_DIR:tmp,DB_PATH:path.join(tmp,"a.db"),JWT_SECRET:"acct"},stdio:["ignore","pipe","pipe"]});
const vite=spawn(process.execPath,["node_modules/vite/bin/vite.js","--port","5185","--strictPort"],{stdio:["ignore","pipe","pipe"]});
const kids=[be,vite]; let err=""; [be,vite].forEach(k=>k.stderr.on("data",d=>err+=d));
async function wait(u,ms=25000){const t0=Date.now();while(Date.now()-t0<ms){try{const r=await fetch(u);if(r.status<500)return true;}catch(e){}await new Promise(r=>setTimeout(r,200));}return false;}
async function main(){
  if(!(await wait("http://localhost:8080/api/health"))||!(await wait("http://localhost:5185/browse-v2.html"))){console.log("not ready",err);for(const k of kids)try{k.kill()}catch(e){};process.exit(1);}
  const b=await chromium.launch({headless:true});
  const p=await b.newPage({viewport:{width:1280,height:800}});
  const errs=[]; p.on("pageerror",e=>errs.push(String(e)));
  await p.goto("http://localhost:5185/browse-v2.html",{waitUntil:"load",timeout:30000});
  // open the account modal (playwright pierces open shadow DOM by default)
  await p.locator('account-widget button:has-text("Log in")').click({timeout:10000});
  await p.locator('account-widget input.u').fill("widgettest");
  await p.locator('account-widget input.p').fill("pw123456");
  await p.locator('account-widget button:has-text("Register")').click();
  // after register, the widget shows the username + a Log out button
  await p.locator('account-widget .wa-name:has-text("widgettest")').waitFor({timeout:10000});
  const shown = await p.locator('account-widget .wa-name').textContent();
  const hasLogout = await p.locator('account-widget button:has-text("Log out")').count();
  // logout
  await p.locator('account-widget button:has-text("Log out")').click();
  await p.locator('account-widget button:has-text("Log in")').waitFor({timeout:5000});
  const backToLogin = await p.locator('account-widget button:has-text("Log in")').count();
  console.log("=== account widget ===");
  console.log("  registered, shown username:", shown);
  console.log("  has Log out button:", hasLogout);
  console.log("  after logout, shows Log in again:", backToLogin);
  console.log("  pageerrors:", errs.length); errs.slice(0,5).forEach(e=>console.log("    "+e));
  await b.close(); for(const k of kids)try{k.kill("SIGTERM")}catch(e){}
  const ok = shown === "widgettest" && hasLogout === 1 && backToLogin === 1 && errs.length === 0;
  console.log("\nACCOUNT WIDGET OK:", ok);
  process.exit(ok?0:1);
}
main().catch(async e=>{console.error(e);for(const k of kids)try{k.kill()}catch(_){};process.exit(2);});
