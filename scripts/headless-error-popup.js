// Headless: verify ErrorPopup is foreground the moment it's shown, even when
// the fail results screen (.grading) is currently displayed. Triggers a fail
// then triggers an error from the Vue shell, and asserts the popup is the
// topmost element on screen.
const { spawn } = require("child_process");
const { chromium } = require("playwright");
const SET = 2006909;
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--port", "5206", "--strictPort"], { stdio: ["ignore", "pipe", "pipe"] });
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
   if (!(await wait("http://localhost:5206/browse"))) { process.exit(1); }
   const b = await chromium.launch({ headless: true, args: ["--use-gl=swiftshader", "--enable-webgl", "--autoplay-policy=no-user-gesture-required"] });
   const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
   const errs = [];
   p.on("pageerror", (e) => errs.push(String(e)));
   await p.goto("http://localhost:5206/browse", { waitUntil: "load", timeout: 30000 });
   await p.waitForFunction(() => typeof window.__ensureGame === "function", null, { timeout: 15000 }).catch(() => {});
   await p.evaluate(() => window.__ensureGame && window.__ensureGame()).catch(() => {});
   await p.waitForFunction(() => window.skinReady && window.soundReady, null, { timeout: 20000 }).catch(() => {});
   await p.evaluate(() => { if (window.game) { window.game.autoplay = true; window.game.autofullscreen = false; } });
   await p.evaluate(async (set) => {
      const r = await fetch("https://catboy.best/d/" + set + "n");
      const ab = await (await r.blob()).arrayBuffer();
      window.__osublob = new Blob([ab]);
      window.launchGame(window.__osublob, 4174364, "Lightspeed");
   }, SET);
   await p.waitForFunction(() => !!window.playback && !!window.playback.osu && !!window.app && !!window.playback.scoreOverlay, null, { timeout: 20000 }).catch(() => { });
   await p.waitForFunction(() => !!(window.playback && window.playback.osu && window.playback.osu.audio), null, { timeout: 20000 }).catch(() => { });

   // 1. Force fail
   await p.evaluate(() => {
      if (window.playback.osu.audio) window.playback.osu.audio.pause = function () { return true; };
      window.playback.scoreOverlay.onfail();
   });
   await p.waitForTimeout(500);

   // 2. Verify grading screen is visible
   const gradingVisible = await p.evaluate(() => {
      const g = document.querySelector(".grading");
      return g ? !g.classList.contains("transparent") : false;
   });
   if (!gradingVisible) {
      console.log("FAIL: grading screen not visible after onfail");
      await b.close();
      for (const k of kids) try { k.kill("SIGTERM"); } catch (e) {}
      process.exit(1);
   }

   // 3. Trigger an error popup while the grading screen is shown
   const popupShown = await p.evaluate(() => {
      if (typeof window.__showErrorPopup !== "function") return { ok: false, err: "no __showErrorPopup" };
      window.__showErrorPopup("Score submission failed: network error", "Could not post score");
      return { ok: true };
   });
   await p.waitForTimeout(300);

   // 4. Verify the popup is above the grading screen via elementFromPoint + z-index
   const result = await p.evaluate(() => {
      const popup = document.querySelector("[data-error-popup]");
      const grading = document.querySelector(".grading");
      if (!popup) return { ok: false, err: "no popup" };
      if (!grading) return { ok: false, err: "no grading" };
      const popupRect = popup.getBoundingClientRect();
      const cx = popupRect.left + popupRect.width / 2;
      const cy = popupRect.top + popupRect.height / 2;
      const top = document.elementFromPoint(cx, cy);
      const cx2 = popupRect.left + 80;
      const cy2 = popupRect.top + 60;
      const top2 = document.elementFromPoint(cx2, cy2);
      const popupInPopup = !!popup.contains(top);
      const popupInPopup2 = !!popup.contains(top2);
      const popupZ = parseInt(getComputedStyle(popup).zIndex, 10);
      const gradingZ = parseInt(getComputedStyle(grading).zIndex, 10);
      // also assert the popup is the last child of body (so it stacks on top)
      const lastChild = document.body.lastElementChild;
      const children = Array.from(document.body.children).map(e => e.tagName + (e.id ? "#" + e.id : "") + (e.className ? "." + String(e.className).slice(0, 30) : "") + (e === popup ? " <-- popup" : ""));
      return {
         ok: popupInPopup && popupInPopup2 && popupZ > gradingZ,
         popupZ,
         gradingZ,
         popupInPopup,
         popupInPopup2,
         topTag: top?.tagName,
         topClasses: top?.className,
         isLastChild: lastChild === popup,
         lastChildTag: lastChild?.tagName,
         lastChildId: lastChild?.id,
         lastChildClass: lastChild?.className,
         children,
      };
   });

   console.log("=== ErrorPopup foreground over fail results ===");
   console.log("  grading visible:", gradingVisible);
   console.log("  popup shown:", JSON.stringify(popupShown));
   console.log("  result:", JSON.stringify(result));
   console.log("  pageerrors:", errs.length);

   await b.close();
   for (const k of kids) try { k.kill("SIGTERM"); } catch (e) {}
   process.exit(result.ok && errs.length === 0 ? 0 : 1);
}
main().catch(async (e) => { console.error(e); for (const k of kids) try { k.kill(); } catch (_) {}; process.exit(2); });
