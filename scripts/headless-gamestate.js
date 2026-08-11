// Verify the GameState seam: path-based get/set, batched writes, mod routing
// through ModRegistry, normalization to window.game, and subscription.
const { spawn } = require("child_process");
const { chromium } = require("playwright");
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--port", "5201", "--strictPort"], { stdio: ["ignore", "pipe", "pipe"] });
const kids = [vite];
async function wait(u, ms = 20000) {
   const t0 = Date.now();
   while (Date.now() - t0 < ms) {
      try { const r = await fetch(u); if (r.status < 500) return true; } catch (e) {}
      await new Promise((r) => setTimeout(r, 200));
   }
   return false;
}
async function main() {
   if (!(await wait("http://localhost:5201/browse"))) { process.exit(1); }
   const b = await chromium.launch({ headless: true, args: ["--autoplay-policy=no-user-gesture-required", "--use-gl=swiftshader", "--enable-webgl"] });
   const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
   const errs = [];
   p.on("pageerror", (e) => errs.push(String(e)));
   await p.goto("http://localhost:5201/browse", { waitUntil: "load", timeout: 30000 });
   await p.waitForFunction(() => typeof window.__ensureGame === "function", null, { timeout: 15000 }).catch(() => {});
   await p.evaluate(() => window.__ensureGame && window.__ensureGame()).catch(() => {});
   await p.waitForFunction(() => window.ModRegistry && window.game, null, { timeout: 20000 }).catch(() => {});

   const result = await p.evaluate(async () => {
      const out = { cases: [], errors: [] };
      try {
         const GameState = (await import("/src/shell/gamestate.js")).default;
         GameState.bind(window.game);

         // 1. Path-based set normalizes across the gamesettings -> window.game bridge.
         GameState.set("display.dim", 75);
         GameState.set("display.cursorsize", 1.5);
         GameState.set("audio.mastervolume", 42);
         out.cases.push({
            name: "settings normalization",
            gsDim: GameState.get("display.dim"),
            gameDim: window.game.backgroundDimRate,
            gsCursor: GameState.get("display.cursorSize"),
            gameCursor: window.game.cursorSize,
            gsMaster: GameState.get("audio.mastervolume"),
            gameMaster: window.game.masterVolume,
         });

         // 2. Mod routing: set mods.flashlight plus its settings, then syncLegacy so
         //    the registry is rebuilt with the new sizes — ModRegistry doesn't
        //    observe settings.* writes, so we need an explicit resync.
         GameState.set("mods.flashlight", true);
         GameState.set("settings.flSize0", 550);
         GameState.set("settings.flSize200", 220);
         GameState.syncLegacy();
         const flSettings = window.ModRegistry.get("FL")?.settings;
         out.cases.push({
            name: "mod round-trip",
            flActive: !!window.game.flashlight,
            flRegistryActive: window.ModRegistry.isActive("FL"),
            flSize0: flSettings?.sizeCombo0,
            flSize200: flSettings?.sizeCombo200,
         });

         // 3. setBatch applies multiple paths atomically and notifies subscribers once per key.
         let notified = 0;
         const unsub = GameState.subscribe("mods.hardrock", () => notified++);
         const changed = GameState.setBatch({
            "mods.hardrock": true,
            "mods.hidden": true,
            "display.dpiscale": 1.5,
         });
         out.cases.push({
            name: "batch + subscribe",
            changed,
            hrActive: window.ModRegistry.isActive("HR"),
            hdActive: window.ModRegistry.isActive("HD"),
            notifyCount: notified,
            gameDpi: window.game.dpiscale,
         });
         unsub();

         // 4. Idempotent set: no change, no notify.
         let idempotent = 0;
         const unsub2 = GameState.subscribe("mods.hardrock", () => idempotent++);
         const changedNone = GameState.set("mods.hardrock", true);
         out.cases.push({
            name: "idempotent set",
            changedNone,
            idempotent,
         });
         unsub2();

         // 5. Deactivation round-trip
         GameState.set("mods.flashlight", false);
         out.cases.push({
            name: "deactivate",
            flActive: !!window.game.flashlight,
            flRegistry: window.ModRegistry.isActive("FL"),
         });

         // 6. Direct write to window.game.* emitted the dev warning (flag cached)
         let warned = false;
         const prevWarn = console.warn;
         console.warn = (...args) => { if (args[0] && String(args[0]).includes("Direct write to window.game.showhwmouse")) warned = true; prevWarn(...args); };
         window.game.showhwmouse = true;
         // wait a tick for the proxy set trap to fire
         await new Promise((r) => setTimeout(r, 0));
         console.warn = prevWarn;
         out.cases.push({ name: "direct-write guard", warned });
      } catch (e) {
         out.errors.push(String(e));
      }
      return out;
   });

   console.log("=== GameState Seam ===");
   for (const c of result.cases) console.log(c.name, "=", JSON.stringify(c));
   if (result.errors.length) console.log("errors:", result.errors);
   console.log("pageerrors:", errs.length);
   if (errs.length) console.log("pageerrors:", errs.slice(0, 5));

   await b.close();
   for (const k of kids) try { k.kill("SIGTERM"); } catch (e) {}

   const [settings, mod, batch, idemp, deactivate, guard] = result.cases;
   const ok =
      settings && settings.gameDim === 0.75 && settings.gameCursor === 1.5 && settings.gameMaster === 0.42 &&
      mod && mod.flActive && mod.flRegistryActive && mod.flSize0 === 550 && mod.flSize200 === 220 &&
      batch && batch.changed === 3 && batch.hrActive && batch.hdActive && batch.notifyCount === 1 && batch.gameDpi === 1.5 &&
      idemp && idemp.changedNone === 0 && idemp.idempotent === 0 &&
      deactivate && !deactivate.flActive && !deactivate.flRegistry &&
      guard && guard.warned === true &&
      errs.length === 0 && result.errors.length === 0;
   console.log("\nGAMESTATE OK:", ok);
   process.exit(ok ? 0 : 1);
}
main().catch(async (e) => { console.error(e); for (const k of kids) try { k.kill(); } catch (_) {}; process.exit(2); });
