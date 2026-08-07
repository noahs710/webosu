const { chromium } = require("playwright");
(async () => {
  try {
    const b = await chromium.launch({ headless: true });
    const p = await b.newPage();
    await p.goto("about:blank");
    console.log("PLAYWRIGHT OK, chromium version:", b.version());
    await b.close();
  } catch (e) { console.log("PLAYWRIGHT ERR:", e.message); }
})();
