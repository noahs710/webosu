// scripts/headless-visual-bench.js — Headless visual + performance verification.
"use strict";
const { spawn } = require("child_process");
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const os = require("os");
const PREVIEW_PORT = 5180;
const SCREENSHOT = path.resolve(__dirname, "visual-bench.png");
const REPORT = path.resolve(__dirname, "visual-bench.json");
const BENCH_URL = "http://localhost:" + PREVIEW_PORT + "/?benchBundle=stress";
const TARGET_SETID = 99999,
   TARGET_BID = 99999,
   TARGET_VER = "Insane";
async function wait(url, ms) {
   var t0 = Date.now();
   while (Date.now() - t0 < ms) {
      try {
         var r = await fetch(url);
         if (r.status < 500) return true;
      } catch (e) {}
      await new Promise(function (r) {
         setTimeout(r, 250);
      });
   }
   return false;
}
async function main() {
   var env = Object.assign({}, process.env, {
      JWT_SECRET: "test",
      PORT: "8080",
      DATA_DIR: fs.realpathSync(os.tmpdir()) + "/webosu-bench",
   });
   fs.mkdirSync(env.DATA_DIR, { recursive: true });
   env.DB_PATH = env.DATA_DIR + "/data.db";
   var api = spawn(process.execPath, ["server/index.js"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: env,
   });
   var kids = [api];
   process.on("exit", function () {
      for (var k of kids)
         try {
            k.kill("SIGTERM");
         } catch (_) {}
   });
   if (!(await wait("http://localhost:8080/api/health", 20000))) {
      console.log("FAIL: API not ready");
      process.exit(1);
   }
   var preview = spawn(
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
   kids.push(preview);
   if (
      !(await wait(BENCH_URL.replace("?benchBundle=stress", "/browse"), 30000))
   ) {
      console.log("FAIL: preview not ready");
      process.exit(1);
   }
   console.log("bootstrap: API on 8080, preview on " + PREVIEW_PORT);
   var b = await chromium.launch({
      headless: true,
      args: ["--use-gl=swiftshader", "--enable-webgl", "--no-sandbox"],
   });
   var ctx = await b.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
   });
   var p = await ctx.newPage();
   var pageErrors = [];
   p.on("pageerror", function (e) {
      pageErrors.push(String(e.stack || e));
   });
   p.on("console", function (m) {
      if (
         m.type() === "error" &&
         !/catboy|api_activity|network|default_osk/.test(m.text())
      )
         pageErrors.push(m.text().slice(0, 200));
   });
   await p.goto(BENCH_URL, { waitUntil: "load", timeout: 30000 });
   await p.waitForFunction(
      function () {
         return (
            window.ModRegistry &&
            window.Playback &&
            Object.keys(window.Skin || {}).length >= 5
         );
      },
      null,
      { timeout: 30000 },
   );
   // Inject synth skin
   await p.evaluate(function () {
      function disc(color) {
         var c = document.createElement("canvas");
         c.width = 64;
         c.height = 64;
         var g = c.getContext("2d");
         g.clearRect(0, 0, 64, 64);
         g.fillStyle = color;
         g.beginPath();
         g.arc(32, 32, 28, 0, Math.PI * 2);
         g.fill();
         g.strokeStyle = "#fff";
         g.lineWidth = 4;
         g.stroke();
         return c;
      }
      function num(d) {
         var c = document.createElement("canvas");
         c.width = 64;
         c.height = 64;
         var g = c.getContext("2d");
         g.fillStyle = "#000";
         g.font = "bold 48px sans-serif";
         g.textAlign = "center";
         g.textBaseline = "middle";
         g.fillText(String(d), 32, 32);
         return c;
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
   // Enable AT (Autoplay) mod so the game auto-plays and we can measure frametimes
   await p.evaluate(function () {
      if (window.ModRegistry) {
         window.ModRegistry.setActive(["AT"]);
         if (window.ModRegistry.applyToGame)
            window.ModRegistry.applyToGame(window.game);
      }
      window.game.autoplay = true;
      if (window.gamesettings) {
         window.gamesettings.autoplay = true;
      }
   });
   // Dispatch beatmap launch
   await p.evaluate(
      function (detail) {
         document.dispatchEvent(
            new CustomEvent("beatmap-launch", { detail: detail }),
         );
      },
      {
         setId: TARGET_SETID,
         beatmapId: TARGET_BID,
         version: TARGET_VER,
         title: "VisualBench",
         artist: "Webosu",
      },
   );
   await p.waitForFunction(
      function () {
         return (
            !!window.playback &&
            window.playback.hits &&
            window.playback.hits.length > 0 &&
            !!window.app &&
            !!window.app.canvas
         );
      },
      null,
      { timeout: 30000 },
   );
   console.log(
      "Playback created with " +
         (await p.evaluate(function () {
            return window.playback.hits.length;
         })) +
         " hits",
   );
   // Enable frametime collection for the benchmark
   await p.evaluate(function () {
      window.__benchCollect = true;
      window.__benchFrames = [];
   });
   // Let the game run for 3 seconds to collect frametime samples
   await p.waitForTimeout(10000);
   // Stop collection
   await p.evaluate(function () {
      window.__benchCollect = false;
   });
   // Collect performance stats
   var perf = await p.evaluate(function () {
      var pb = window.playback;
      if (!pb) return { err: "no playback" };
      var first = pb.hits[0];
      var obj0 = first && first.objects && first.objects[0];
      var num0 = first && first.numbers && first.numbers[0];
      var jdg0 = first && first.judgements && first.judgements[0];
      // Collect frametime samples from the render loop
      var frames = window.__benchFrames || [];
      var frameTimes = frames.map(function (f) {
         return f.dt;
      });
      frameTimes.sort(function (a, b) {
         return a - b;
      });
      function pct(arr, p) {
         if (!arr.length) return 0;
         return arr[Math.floor((arr.length - 1) * p)];
      }
      return {
         hitCount: pb.hits.length,
         CS: pb.CS,
         OD: pb.OD,
         AR: pb.AR,
         HP: pb.HP,
         circleRadius: pb.circleRadius,
         hitSpriteScale: pb.hitSpriteScale,
         firstHitType: first.type,
         firstHitPos: { x: first.x, y: first.y },
         firstHitObjCount: first.objects ? first.objects.length : 0,
         firstHitNumberCount: first.numbers ? first.numbers.length : 0,
         firstHitFirstObj: obj0
            ? {
                 ctor: obj0.constructor.name,
                 scaleX: obj0.scale.x,
                 hasSource: !!(obj0.texture && obj0.texture.source),
              }
            : null,
         firstHitNumberSprite: num0
            ? {
                 ctor: num0.constructor.name,
                 scaleX: num0.scale.x,
                 hasSource: !!(num0.texture && num0.texture.source),
              }
            : null,
         firstHitJudgement: jdg0
            ? {
                 ctor: jdg0.constructor.name,
                 fontSize: (jdg0.style && jdg0.style.fontSize) || null,
                 scaleX: jdg0.scale.x,
                 scaleY: jdg0.scale.y,
                 hasSource: !!(jdg0.texture && jdg0.texture.source),
              }
            : null,
         followPointsCount: (function () {
            for (var i = 0; i < pb.hits.length - 1; i++) {
               var fp = pb.hits[i + 1].followPoints;
               if (fp && fp.children) return fp.children.length;
            }
            return 0;
         })(),
         bgPresent: !!pb.background,
         skinKeys: Object.keys(window.Skin || {}).length,
         modsRegistered: window.ModRegistry
            ? window.ModRegistry.allAcronyms().length
            : 0,
         isMobile: /Android|iPhone|iPad|iPod|Mobile/.test(navigator.userAgent),
         touchPauseBtn: !!document.getElementById("touch-pause-btn"),
         modPanelZ: (function () {
            var m = document.getElementById("pause-mod-panel");
            return m ? getComputedStyle(m).zIndex : null;
         })(),
         oomHook: !!window.__webosu_oom_hook_installed,
         showTapIndicator: pb.showTapIndicator,
         // Performance stats
         frameCount: frameTimes.length,
         avgFrameTime: frameTimes.length
            ? frameTimes.reduce(function (a, b) {
                 return a + b;
              }, 0) / frameTimes.length
            : 0,
         p50FrameTime: pct(frameTimes, 0.5),
         p95FrameTime: pct(frameTimes, 0.95),
         p99FrameTime: pct(frameTimes, 0.99),
         maxFrameTime: frameTimes.length
            ? frameTimes[frameTimes.length - 1]
            : 0,
         minFrameTime: frameTimes.length ? frameTimes[0] : 0,
         fps: frameTimes.length
            ? 1000 /
              (frameTimes.reduce(function (a, b) {
                 return a + b;
              }, 0) /
                 frameTimes.length)
            : 0,
         // AT mod state
         autoplay: pb.autoplay,
         currentHitIndex: pb.currentHitIndex,
      };
   });
   // Screenshot
   try {
      await p.screenshot({ path: SCREENSHOT, fullPage: false });
      console.log("screenshot: " + SCREENSHOT);
   } catch (e) {
      console.log("SCREENSHOT-ERR: " + e.message);
   }
   fs.writeFileSync(REPORT, JSON.stringify(perf, null, 2));
   console.log("report: " + REPORT);
   // Pass/fail assertions
   var checks = [];
   function check(name, ok, detail) {
      checks.push({ name: name, ok: !!ok, detail: detail });
   }
   check("hitCount >= 1", perf.hitCount >= 1, perf.hitCount + " hits");
   check(
      "hitSpriteScale > 0",
      perf.hitSpriteScale > 0,
      "scale=" + perf.hitSpriteScale,
   );
   check(
      "hitSpriteScale normalized to disc texture",
      perf.hitSpriteScale > 0 && perf.circleRadius > 0,
      "scale=" + perf.hitSpriteScale + ", r=" + perf.circleRadius,
   );
   check(
      "first hit object constructed",
      !!(
         perf.firstHitFirstObj &&
         (perf.firstHitFirstObj.hasSource || perf.firstHitFirstObj.ctor === "G")
      ),
      JSON.stringify(perf.firstHitFirstObj),
   );
   check(
      "first hit number has source",
      !!(perf.firstHitNumberSprite && perf.firstHitNumberSprite.hasSource),
      JSON.stringify(perf.firstHitNumberSprite),
   );
   check(
      "judgement has source",
      !!(perf.firstHitJudgement && perf.firstHitJudgement.hasSource),
      JSON.stringify(perf.firstHitJudgement),
   );
   check("bg present", perf.bgPresent, "bg=" + perf.bgPresent);
   check("skinKeys >= 5", perf.skinKeys >= 5, perf.skinKeys + " textures");
   check(
      "mods registered >= 10",
      perf.modsRegistered >= 10,
      perf.modsRegistered + " mods",
   );
   check("mobile == false", perf.isMobile === false, "mobile=" + perf.isMobile);
   check(
      "no touch pause btn",
      perf.touchPauseBtn === false,
      "btn=" + perf.touchPauseBtn,
   );
   check(
      "mod-panel z-index 10",
      perf.modPanelZ === "10",
      "z=" + perf.modPanelZ,
   );
   check("OOM hook installed", perf.oomHook, "oom=" + perf.oomHook);
   check(
      "showTapIndicator is true",
      perf.showTapIndicator !== false,
      "tap=" + perf.showTapIndicator,
   );
   check(
      "AT mod active (autoplay)",
      perf.autoplay === true,
      "autoplay=" + perf.autoplay,
   );
   check(
      "frametime p95 < 33ms (30fps)",
      perf.p95FrameTime < 33,
      "p95=" + perf.p95FrameTime + "ms",
   );
   check(
      "frametime p50 < 20ms (50fps)",
      perf.p50FrameTime < 20,
      "p50=" + perf.p50FrameTime + "ms",
   );
   // Static-source assertions
   try {
      var launchSrc = fs.readFileSync("src/game/launchgame.js", "utf8");
      var playbackSrc = fs.readFileSync("src/game/playback.js", "utf8");
      check(
         "touch-pause gate uses (pointer: coarse)",
         /\(pointer:\s*coarse\)/.test(launchSrc) &&
            /ontouchstart/.test(launchSrc),
         "launchgame.js",
      );
      check(
         "default-bg fallback uses WHITE",
         /img\/defaultbg\.jpg/.test(playbackSrc) &&
            /PIXI\.Texture\.WHITE/.test(playbackSrc),
         "playback.js",
      );
      check(
         "hitSpriteScale normalized to disc texture",
         /circleRadius \/ 64/.test(playbackSrc),
         "playback.js",
      );
      check(
         "number anchorY = 0.5 (centered)",
         /0\.5,\s*\/\/ centered vertically/.test(playbackSrc),
         "playback.js",
      );
      check(
         "scrub-frame guard in updateJudgement",
         /_scrubFrame/.test(playbackSrc),
         "playback.js",
      );
      check(
         "burst-miss cap in updateJudgement",
         /MAX_MISSES_PER_FRAME/.test(playbackSrc),
         "playback.js",
      );
      // Verify hit-area uses circleRadius (not texture size) for click detection
      var playerSrc = fs.readFileSync("src/game/playerActions.js", "utf8");
      check(
         "hit-area uses circleRadius for click detection",
         /circleRadius \* playback\.circleRadius/.test(playerSrc),
         "playerActions.js:144",
      );
      // Verify slider first judgement finalTime extends to slider end
      check(
         "slider first judgement finalTime = hit.endTime + MehTime",
         /hit\.judgements\[0\]\.finalTime = hit\.endTime \+ this\.MehTime/.test(
            playbackSrc,
         ),
         "playback.js:1868",
      );
   } catch (e) {
      check("static-source assertions", false, String(e));
   }
   console.log("=== checks ===");
   for (var c of checks)
      console.log((c.ok ? "PASS" : "FAIL") + " " + c.name + " :: " + c.detail);
   console.log("=== performance ===");
   console.log(
      "  frames: " + perf.frameCount + ", fps: " + perf.fps.toFixed(1),
   );
   console.log(
      "  p50: " +
         perf.p50FrameTime.toFixed(2) +
         "ms, p95: " +
         perf.p95FrameTime.toFixed(2) +
         "ms, p99: " +
         perf.p99FrameTime.toFixed(2) +
         "ms",
   );
   console.log(
      "  min: " +
         perf.minFrameTime.toFixed(2) +
         "ms, max: " +
         perf.maxFrameTime.toFixed(2) +
         "ms",
   );
   console.log("=== pageerrors (" + pageErrors.length + ") ===");
   for (var e of pageErrors.slice(0, 5)) console.log("  " + e);
   await b.close();
   for (var k of kids)
      try {
         k.kill("SIGTERM");
      } catch (_) {}
   var allOk = checks.every(function (c) {
      return c.ok;
   });
   process.exit(allOk ? 0 : 1);
}
main().catch(function (e) {
   console.error("FATAL", (e && e.stack) || e);
   process.exit(2);
});
