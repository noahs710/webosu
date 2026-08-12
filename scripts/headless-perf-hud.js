// scripts/headless-perf-hud.js — Performance stress test using the local stress.osz
// fixture (240 hit objects, ~54 seconds). Runs for 15 seconds to collect a
// meaningful frametime sample, then verifies the perf HUD shows FPS/p95/p99.
// Uses the local bench-bundle so it doesn't depend on catboy.best CORS.
const { spawn } = require("child_process");
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const os = require("os");
const PREVIEW_PORT = 5192;
const BENCH_URL = "http://localhost:" + PREVIEW_PORT + "/?benchBundle=stress";
const env = Object.assign({}, process.env, {
   JWT_SECRET: "test",
   PORT: "8081",
   DATA_DIR: fs.realpathSync(os.tmpdir()) + "/webosu-perf-hud",
});
fs.mkdirSync(env.DATA_DIR, { recursive: true });
env.DB_PATH = env.DATA_DIR + "/data.db";
const api = spawn(process.execPath, ["server/index.js"], {
   stdio: ["ignore", "pipe", "pipe"],
   env: env,
});
const vite = spawn(
   process.execPath,
   [
      "node_modules/vite/bin/vite.js",
      "preview",
      "--port",
      String(PREVIEW_PORT),
      "--strictPort",
   ],
   { stdio: ["ignore", "pipe", "pipe"], env: env },
);
const kids = [api, vite];
let ve = "";
vite.stderr.on("data", (d) => (ve += d));
let ae = "";
api.stderr.on("data", (d) => (ae += d));
async function wait(u, ms) {
   var t0 = Date.now();
   while (Date.now() - t0 < (ms || 20000)) {
      try {
         var r = await fetch(u);
         if (r.status < 500) return true;
      } catch (e) {}
      await new Promise(function (r) {
         setTimeout(r, 200);
      });
   }
   return false;
}
async function main() {
   if (!(await wait("http://localhost:8081/api/health", 20000))) {
      console.log("API not ready", ae);
      process.exit(1);
   }
   if (
      !(await wait(BENCH_URL.replace("?benchBundle=stress", "/browse"), 30000))
   ) {
      console.log("vite not ready", ve);
      process.exit(1);
   }
   var b = await chromium.launch({
      headless: true,
      args: ["--use-gl=swiftshader", "--enable-webgl", "--no-sandbox"],
   });
   var p = await b.newPage({ viewport: { width: 1280, height: 720 } });
   var errs = [];
   p.on("pageerror", function (e) {
      errs.push(String(e));
   });
   var logs = [];
   p.on("console", function (m) {
      if (/webosu v8 perf/.test(m.text())) logs.push(m.text());
   });
   await p.goto(BENCH_URL, { waitUntil: "load", timeout: 30000 });
   await p
      .waitForFunction(
         function () {
            return typeof window.__ensureGame == "function";
         },
         null,
         { timeout: 15000 },
      )
      .catch(function () {});
   await p
      .evaluate(function () {
         window.__ensureGame && window.__ensureGame();
      })
      .catch(function () {});
   await p
      .waitForFunction(
         function () {
            return window.skinReady && window.soundReady;
         },
         null,
         { timeout: 20000 },
      )
      .catch(function () {});
   // Inject synth skin
   await p.evaluate(function () {
      function disc(c) {
         var cv = document.createElement("canvas");
         cv.width = 64;
         cv.height = 64;
         var g = cv.getContext("2d");
         g.clearRect(0, 0, 64, 64);
         g.fillStyle = c;
         g.beginPath();
         g.arc(32, 32, 28, 0, Math.PI * 2);
         g.fill();
         g.strokeStyle = "#fff";
         g.lineWidth = 4;
         g.stroke();
         return cv;
      }
      function num(d) {
         var cv = document.createElement("canvas");
         cv.width = 64;
         cv.height = 64;
         var g = cv.getContext("2d");
         g.fillStyle = "#000";
         g.font = "bold 48px sans-serif";
         g.textAlign = "center";
         g.textBaseline = "middle";
         g.fillText(String(d), 32, 32);
         return cv;
      }
      var T = function (c) {
         return PIXI.Texture.from(c);
      };
      var synth = {
         "hitcircle.png": T(disc("#ff66aa")),
         "hitcircleoverlay.png": T(disc("#fff")),
         "approachcircle.png": T(disc("#fff")),
         "cursor.png": T(disc("#fff")),
         "hit0.png": T(disc("#ff0000")),
         "hit50.png": T(disc("#ffd966")),
         "hit100.png": T(disc("#88b300")),
         "hit300.png": T(disc("#66ccff")),
         "hit300g.png": T(disc("#ffff66")),
         "hit100k.png": T(disc("#33ddcc")),
         "followpoint.png": T(disc("#ffaa00")),
         "followpoint-0.png": T(disc("#ffaa00")),
         "disc.png": T(disc("#cc55ff")),
      };
      for (var i = 1; i <= 9; i++)
         synth["followpoint-" + i + ".png"] = T(disc("#ffaa00"));
      for (var d = 1; d <= 5; d++) synth[d + ".png"] = T(num(d));
      for (var s2 = 0; s2 <= 3; s2++)
         synth["score-" + s2 + ".png"] = T(num(s2));
      window.Skin = Object.assign({}, window.Skin || {}, synth);
   });
   // Patch audio
   await p.evaluate(function () {
      var O = window.Osu;
      if (O && O.prototype && O.prototype.load_mp3) {
         O.prototype.load_mp3 = function () {
            this.audio = {
               getPosition: function () {
                  return 0;
               },
               play: function () {},
               pause: function () {
                  return false;
               },
               gain: { gain: { value: 1 } },
               source: null,
               playbackRate: 1,
               oncanplay: null,
               playState: 1,
            };
            if (this.onready) this.onready();
         };
      }
   });
   // Enable AT mod
   await p.evaluate(function () {
      if (window.ModRegistry) {
         window.ModRegistry.setActive(["AT"]);
         if (window.ModRegistry.applyToGame)
            window.ModRegistry.applyToGame(window.game);
      }
      window.game.autoplay = true;
      if (window.gamesettings) window.gamesettings.autoplay = true;
   });
   // Enable perf HUD — the launchgame.js init checks ?perf=1 in the URL OR
   // gamesettings.showFPS. We set both, then also press F3 to toggle it on.
   await p.evaluate(function () {
      if (window.game) {
         window.game.showFPS = true;
      }
      if (window.gamesettings) {
         window.gamesettings.showFPS = true;
      }
   });
   await p.keyboard.press("F3");
   // Dispatch beatmap launch with the stress fixture (240 hits, ~54 seconds)
   await p.evaluate(
      function (detail) {
         document.dispatchEvent(
            new CustomEvent("beatmap-launch", { detail: detail }),
         );
      },
      {
         setId: 99998,
         beatmapId: 99998,
         version: "Insane",
         title: "StressTest",
         artist: "Webosu",
      },
   );
   await p
      .waitForFunction(
         function () {
            return (
               !!window.playback &&
               window.playback.hits &&
               window.playback.hits.length > 0
            );
         },
         null,
         { timeout: 30000 },
      )
      .catch(function () {});
   // Run for 15 seconds — long enough to cover burst patterns and gaps in the 54s stress fixture
   // Run for 60 seconds — covers the full ~54s stress fixture (240 hit objects)
   await p.waitForTimeout(60000);
   var hud = await p.evaluate(function () {
      var el = document.getElementById("perf-hud");
      return el
         ? {
              display: getComputedStyle(el).display,
              text: el.textContent.replace(/\s+/g, " ").slice(0, 200),
           }
         : null;
   });
   await p.keyboard.press("F4");
   await p.waitForTimeout(500);
   var f4 = await p.evaluate(function () {
      return {
         sum: window.__perfSummary || null,
         hitCount: window.playback ? window.playback.hits.length : 0,
         currentHitIndex: window.playback ? window.playback.currentHitIndex : 0,
      };
   });
   console.log("=== perf HUD ===");
   console.log("  ", JSON.stringify(hud));
   console.log("  F4 -> window.__perfSummary:", f4.sum);
   console.log(
      "  F4 console log captured:",
      logs.length > 0,
      logs[0] ? logs[0].slice(0, 120) : "",
   );
   console.log("  hits:", f4.hitCount, "currentHitIndex:", f4.currentHitIndex);
   var ok =
      hud &&
      /FPS/.test(hud.text) &&
      /p95/.test(hud.text) &&
      !!f4.sum &&
      /webosu v8 perf/.test(f4.sum) &&
      f4.hitCount >= 100;
   console.log("perf HUD visible + shows FPS/p95:", ok);
   console.log("  hitCount >= 100 (stress density):", f4.hitCount >= 100);
   await b.close();
   for (var k of kids)
      try {
         k.kill("SIGTERM");
      } catch (e) {}
   var fatal = errs.filter(function (e) {
      return !/catboy|api\/|500|network|Audio decode|detached|EncodingError/i.test(
         e,
      );
   });
   console.log("fatal:", fatal.length);
   fatal.slice(0, 4).forEach(function (e) {
      console.log("  " + e.slice(0, 180));
   });
   process.exit(ok && fatal.length === 0 ? 0 : 1);
}
main().catch(function (e) {
   console.error("FATAL", e);
   for (var k of kids)
      try {
         k.kill();
      } catch (_) {}
   process.exit(2);
});
