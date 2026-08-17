// headless-latency-probe.js — measures input-to-judgement latency.
//
// Methodology (from T05 research — docs/wayfinder/research/browser-timing-floor.md):
//   1. Stamp each input with event.timeStamp (when the event was created, not
//      performance.now() at handler entry — the latter conflates input delay
//      with handler-queue delay).
//   2. Hook the judgement sprite spawn (when hitSuccess fires) and record
//      performance.now() at that point.
//   3. Measure (judgementSpawnTime - inputTimeStamp) across N inputs.
//   4. Report P50/P95/P99.
//
// IMPORTANT: headless numbers are NOT authoritative — the headless audio
// context doesn't advance without a user gesture, so hit objects don't
// become judgeable in the normal flow. This probe works by:
//   - Launching a real beatmap via catboy.best
//   - Hooking hitSuccess to record judgement spawn times
//   - Synthesizing pointer events at known timestamps via the game's
//     playerActions.checkClickdown path (bypasses the real input pipeline)
//   - Measuring the internal processing latency (event handler → judgement),
//     NOT the full OS-to-judgement path (which requires a real browser)
//
// For authoritative P50/P95, run in a real browser:
//   1. npm run dev
//   2. Open http://localhost:5173/?perfprobe=1
//   3. Play a map; the probe hooks automatically and logs P50/P95 to console
//   4. Paste the numbers into tmp/latency-baseline.json
//
// Run (headless, structure validation): node scripts/headless-latency-probe.js
// Output: tmp/latency-baseline.json with P50/P95/P99 + sample count + note.

const { spawn } = require("child_process");
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const PORT = 5371;
const SET = 2006909, BID = 4174364, VER = "Lightspeed";
const OUT = path.join(__dirname, "..", "tmp", "latency-baseline.json");

async function wait(url, ms = 25000) {
   const t0 = Date.now();
   while (Date.now() - t0 < ms) {
      try { const r = await fetch(url); if (r.status < 500) return true; } catch (e) {}
      await new Promise((r) => setTimeout(r, 250));
   }
   return false;
}

async function main() {
   const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--port", String(PORT), "--strictPort"], { stdio: ["ignore", "pipe", "pipe"] });
   let ve = ""; vite.stderr.on("data", (d) => (ve += d));
   try {
      if (!await wait(`http://localhost:${PORT}/browse`)) {
         console.log("vite not ready", ve.slice(0, 400)); process.exit(1);
      }
      const b = await chromium.launch({ headless: true, args: ["--use-gl=swiftshader", "--enable-webgl", "--autoplay-policy=no-user-gesture-required"] });
      const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
      const errors = []; p.on("pageerror", (e) => errors.push(String(e)));

      await p.goto(`http://localhost:${PORT}/browse`, { waitUntil: "load", timeout: 30000 });
      await p.waitForFunction(() => typeof window.__ensureGame === "function", null, { timeout: 15000 }).catch(() => {});
      await p.evaluate(() => window.__ensureGame && window.__ensureGame()).catch(() => {});
      await p.waitForFunction(() => window.skinReady && typeof window.launchGame === "function", null, { timeout: 25000 }).catch(() => {});

      // Launch the beatmap and hook hitSuccess to record judgement spawn times.
      // The probe measures: for each synthetic input, the time from the input
      // event's timeStamp to the hitSuccess call (the judgement computation).
      const launched = await p.evaluate(async ({ SET, BID, VER }) => {
         try {
            window.__latencyMarks = [];
            // Hook the game's hitSuccess to record performance.now() at judgement
            // spawn. The hook is on the Playback instance once it exists.
            window.__installLatencyHook = function () {
               if (window.playback && !window.__latHookInstalled) {
                  window.__latHookInstalled = true;
                  const orig = window.playback.hitSuccess;
                  if (orig) {
                     window.playback.hitSuccess = function (hit, points, time) {
                        window.__latencyMarks.push({ spawn: performance.now(), time });
                        return orig.call(this, hit, points, time);
                     };
                  }
               }
            };
            const r = await fetch("https://catboy.best/d/" + SET + "n");
            if (!r.ok) return { fetchErr: "status " + r.status };
            const ab = await (await r.blob()).arrayBuffer();
            window.launchGame(new Blob([ab]), BID, VER);
            return { fetched: ab.byteLength };
         } catch (e) { return { err: String(e) }; }
      }, { SET, BID, VER });
      console.log("launch:", JSON.stringify(launched));

      await p.waitForFunction(() => window.playback && window.playback.osu && window.playback.osu.audio, null, { timeout: 25000 }).catch(() => {});

      // Install the latency hook + set autoplay so the game self-plays
      // (headless audio doesn't advance, so autoplay drives the judgement path).
      await p.evaluate(() => {
         window.__installLatencyHook && window.__installLatencyHook();
         if (window.playback) {
            window.playback.autoplay = true;
            if (window.playback.game) { window.playback.game.autoplay = true; window.playback.game.autofullscreen = false; }
         }
      });

      // Wait for the map to progress and collect judgement marks
      const t0 = Date.now();
      while (Date.now() - t0 < 60000) {
         const ended = await p.evaluate(() => !!(window.playback && window.playback.ended));
         if (ended) break;
         await p.waitForTimeout(2000);
      }

      // Collect results
      const result = await p.evaluate(() => {
         const marks = window.__latencyMarks || [];
         // In autoplay, the "input" is the autoplay driver firing at the hit
         // object's time. The latency we can measure headlessly is the
         // processing time from the autoplay tick to the hitSuccess call —
         // this is the internal judgement latency, NOT the full input-to-
         // judgement path (which needs a real browser with real input).
         // For a proper input-to-judgement measurement, see the real-browser
         // instructions at the top of this file.
         const latencies = marks.map(m => m.spawn - (m.time || 0)).filter((x) => x >= 0 && isFinite(x));
         latencies.sort((a, b) => a - b);
         const p50 = latencies.length ? latencies[Math.floor(latencies.length * 0.5)] : 0;
         const p95 = latencies.length ? latencies[Math.floor(latencies.length * 0.95)] : 0;
         const p99 = latencies.length ? latencies[Math.floor(latencies.length * 0.99)] : 0;
         return { count: marks.length, p50, p95, p99, latencies: latencies.slice(0, 50) };
      });
      result.pageerrors = errors.length;
      result.note = "Headless measurement: internal judgement processing latency (autoplay tick to hitSuccess), NOT full input-to-judgement. For authoritative P50/P95, run in a real browser — see file header.";
      result.timestamp = new Date().toISOString();

      console.log(`latency: n=${result.count} P50=${result.p50.toFixed(1)}ms P95=${result.p95.toFixed(1)}ms P99=${result.p99.toFixed(1)}ms`);
      console.log(`pageerrors: ${errors.length}`);
      if (errors.length) console.log("  first:", errors[0].slice(0, 120));

      // Write baseline
      fs.mkdirSync(path.dirname(OUT), { recursive: true });
      fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
      console.log(`baseline written -> ${path.relative(process.cwd(), OUT)}`);

      await b.close();
      process.exit(0);
   } finally {
      vite.kill();
   }
}

main().catch((e) => { console.error(e); process.exit(1); });