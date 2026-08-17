import OsuAudio from "./osu-audio.js";
import { log as llog, warn as lwarn, error as lerror } from "./logger.js";
import { gamesettings } from "../shell/gamesettings.js";
export async function launchOSU(osu, beatmapid, version) {
   try { gamesettings.loadToGame(); } catch {}
   // ensure default Skin is loaded before creating hits (avoid WHITE fallback)
   if (!window.Skin) {
      let tries = 0;
      while (!window.Skin && tries < 40) {
         await new Promise(r => setTimeout(r, 50));
         tries++;
      }
      if (!window.Skin) window.Skin = {};
      if (!window.Skin["hit300.png"]) lwarn("launchgame", "window.Skin not ready, using WHITE fallback");
   }
   llog("launchgame", "launchOSU", { beatmapid, version, tracks: osu.tracks?.length, autoplay: window.game?.autoplay });
   // select track (defensive against a missing metadata or Mode field)
   let trackid = -1;
   if (Array.isArray(osu.tracks)) {
      for (let i = 0; i < osu.tracks.length; i++) {
         const t = osu.tracks[i];
         if (!t || !t.metadata) continue;
         if (t.metadata.BeatmapID == beatmapid) { trackid = i; break; }
         if (version && t.metadata.Version == version && (t.general == null || t.general.Mode == 0 || t.general.Mode == undefined)) {
            trackid = i; break;
         }
      }
   }
   if (trackid == -1) {
      lerror("launchgame", "No such track", { beatmapid, version, available: osu.tracks?.map(t=>({id: t && t.metadata && t.metadata.BeatmapID, ver: t && t.metadata && t.metadata.Version})) });
      // Surface via the foreground ErrorPopup so the user isn't left on a blank
      // loading screen when the requested difficulty isn't in the .osu.
      if (typeof window.__showErrorPopup === "function") {
         try { window.__showErrorPopup("This beatmap doesn't contain that difficulty (it may be a different game mode or set).", "Could not launch beatmap"); } catch {}
      }
      const overlay = document.getElementById("beatmap-loading-overlay");
      if (overlay) overlay.remove();
      return;
   }
   llog("launchgame", "selected track", trackid, osu.tracks[trackid]?.metadata);
   // prevent launching multiple times
   if (window.app) { lwarn("launchgame", "app already exists, ignoring launch"); return; }
   llog("launchgame", "Launching PIXI app", { beatmapid, version, trackid });
    // launch PIXI app — adaptive quality: AA off on low-end for FPS, on for visual quality
    const _lowEnd = (() => {
      try {
         return (navigator.deviceMemory && navigator.deviceMemory <= 4) ||
                (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
      } catch { return false; }
    })();
    let app = (window.app = new PIXI.Application());
    await app.init({
       width: window.innerWidth,
       height: window.innerHeight,
       resolution: Math.min(2, (window.game.overridedpi ? window.game.dpiscale : window.devicePixelRatio) || 1),
       background: 0x111111,
       backgroundAlpha: 1,
       autoDensity: true,
       antialias: !_lowEnd,
       powerPreference: "high-performance",
       preference: "webgpu", // T17: WebGPU with Pixi 8 auto-fallback to WebGL (85% browser coverage)
       // per pixijs-performance skill — GC tuning (ms), not deprecated textureGC.*
       gcActive: true,
       gcMaxUnusedTime: 60_000,
       gcFrequency: 30_000,
    });
   // stop the ticker — we render manually via requestAnimationFrame to avoid double-rendering
   try { app.ticker.stop(); } catch {}
   
   

   // remember where the page is scrolled to
   let scrollTop = document.body.scrollTop;
   // save alert function and replace with silent alert to prevent pop-up in game
   let defaultAlert = window.alert;
   window.alert = function (msg) {
      if (import.meta.env.DEV) console.log("IN-GAME ALERT " + msg);
    };
    // get ready for gaming
    const contextMenuHandler = function (e) {
       e.preventDefault();
       return false;
    };
    document.addEventListener("contextmenu", contextMenuHandler);
    document.body.classList.add("gaming");
   // update game settings (wrap so a loadToGame throw doesn't take down the
   // PIXI app + cursor that we just initialized)
   try {
      if (window.gamesettings) {
         window.gamesettings.refresh();
         window.gamesettings.loadToGame();
      }
   } catch (e) { lerror("launchgame", "gamesettings load failed", e); }

   // load cursor
   if (!game.showhwmouse || game.autoplay || game.replayMode) {
      // cursor + trail live in a dedicated top layer so we never re-parent
      // individual sprites each frame (render win: cursor-trail z-order fix).
      // Trail sprites keep a fixed back-to-front order; the cursor is added
      // last so it renders above the trail.
       game.cursorLayer = new PIXI.Container();
       game.cursorLayer.eventMode = 'none';
       game.cursorLayer.cullable = false;
       game.cursorLayer.zIndex = 999; // v8: zIndex keeps cursor on top, no per-frame reparent
       game.stage.addChild(game.cursorLayer);
      const cursorCentre = !(window.game && window.game.skinConfig && window.game.skinConfig.cursorCentre === false);
      const anchorVal = cursorCentre ? 0.5 : 0;
      game.cursor = new PIXI.Sprite(window.Skin?.["cursor.png"] || PIXI.Texture.WHITE);
      game.cursor.anchor.x = game.cursor.anchor.y = anchorVal;
      game.cursor.eventMode = 'none';
      game.cursor.cullable = false;
      var effectiveCursorSize = (window.game && window.game.skinCursorSize) ? window.game.skinCursorSize : game.cursorSize;
      game.cursor.scale.x = game.cursor.scale.y = 0.3 * effectiveCursorSize;
      // cursormiddle is an optional inner dot from skin (if present, rendered on top of cursor)
      if (window.Skin?.["cursormiddle.png"]) {
         game.cursorMiddle = new PIXI.Sprite(window.Skin?.["cursormiddle.png"] || PIXI.Texture.WHITE);
         game.cursorMiddle.anchor.set(anchorVal);
         game.cursorMiddle.eventMode = 'none';
         game.cursorMiddle.cullable = false;
         game.cursorMiddle.scale.set(0.15 * effectiveCursorSize);
      }
      // store for anchor handling in trail
      game._cursorAnchor = anchorVal;
      // cursor trail: a ring buffer of recent positions fading behind the cursor
      game.cursorTrail = [];
      for (let i = 0; i < 8; i++) {
         let trailTex = (window.Skin?.["cursortrail.png"]) ? window.Skin?.["cursortrail.png"] : (window.Skin?.["cursor.png"] || PIXI.Texture.WHITE);
         let t = new PIXI.Sprite(trailTex);
         t.anchor.x = t.anchor.y = anchorVal;
         t.eventMode = 'none';
         t.cullable = false;
         t.scale.x = t.scale.y = 0.3 * effectiveCursorSize;
         t.alpha = 0;
         game.cursorLayer.addChild(t);
         game.cursorTrail.push({
            sprite: t,
            x: game.mouseX,
            y: game.mouseY,
         });
      }
      game.cursorTrailHead = 0;
      game.cursorLayer.addChild(game.cursor);
      if (game.cursorMiddle) game.cursorLayer.addChild(game.cursorMiddle);
   }

   // switch page to game view
   if (game.autofullscreen) document.documentElement.requestFullscreen();
   let pGameArea = document.getElementById("game-area");
   var pMainPage = document.getElementById("main-page");
   var pNav = document.getElementById("main-nav");
   pGameArea.appendChild(app.canvas);
   if (game.autoplay) {
      pGameArea.classList.remove("shownomouse");
      pGameArea.classList.remove("showhwmousemedium");
      pGameArea.classList.remove("showhwmousesmall");
      pGameArea.classList.remove("showhwmousetiny");
   } else if (game.showhwmouse) {
      pGameArea.classList.remove("shownomouse");
      if (game.cursorSize < 0.65) pGameArea.classList.add("showhwmousetiny");
      else if (game.cursorSize < 0.95)
         pGameArea.classList.add("showhwmousesmall");
      else pGameArea.classList.add("showhwmousemedium");
   } else {
      pGameArea.classList.add("shownomouse");
      pGameArea.classList.remove("showhwmousemedium");
      pGameArea.classList.remove("showhwmousesmall");
      pGameArea.classList.remove("showhwmousetiny");
   }
   // pause via ESC for desktop. On touch devices we ALSO add a small on-screen
   // pause button in the top-right corner so users without a keyboard can still
   // open the pause menu. The button has aria-label="Pause" so the headless-touch
   // test can find it. It is appended to pGameArea so it follows the same lifecycle
   // (removed by quitGame on game teardown).
   var touchPauseBtn = null;
   try {
      // Treat as touch only if the PRIMARY input is coarse (tablet/phone). Laptops with touchscreens
      // still report maxTouchPoints>0 but their primary pointer is fine — no on-screen pause button.
      var isTouch = (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) || ("ontouchstart" in window && (navigator.maxTouchPoints || 0) > 0 && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || ""));
   } catch (e) { var isTouch = false; }
   if (isTouch) {
      touchPauseBtn = document.createElement("button");
      touchPauseBtn.id = "touch-pause-btn";
      touchPauseBtn.setAttribute("aria-label", "Pause");
      touchPauseBtn.textContent = "\u2759\u2759";
      touchPauseBtn.style.cssText = "position:fixed;top:14px;right:14px;z-index:60;width:42px;height:42px;border-radius:50%;border:1px solid rgba(255,255,255,0.25);background:rgba(20,20,30,0.7);color:#fff;font-size:14px;line-height:1;display:flex;align-items:center;justify-content:center;cursor:pointer;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);font-family:system-ui,sans-serif;";
      touchPauseBtn.onclick = function (ev) {
         if (ev) { ev.preventDefault(); ev.stopPropagation(); }
         try { if (window.playback && !window.playback.game.paused && !window.playback.ended) window.playback.pause(); } catch (e) {}
      };
      pGameArea.appendChild(touchPauseBtn);
   }
   // ---- Phase 6 perf HUD (frame timing) ----
   var perfHUD = document.createElement("div");
   perfHUD.id = "perf-hud";
   Object.assign(perfHUD.style, {
      position: "fixed", top: "8px", left: "10px", zIndex: "50",
      fontFamily: "monospace", fontSize: "12px", lineHeight: "1.35",
      color: "#ececf4", background: "rgba(20,20,30,.6)",
      border: "1px solid rgba(255,255,255,.18)", borderRadius: "8px",
      padding: "6px 9px", pointerEvents: "none", display: "none",
   });
   perfHUD.innerHTML = "FPS -- · p50 -- · <b>p95 --</b> · p99 -- · drop --";
   pGameArea.appendChild(perfHUD);
   var perfOn = (() => {
      try {
         if (new URLSearchParams(location.search).get("perf") === "1") return true;
         if (window.gamesettings && gamesettings.showFPS) return true;
      } catch (e) {}
      return false;
   })();
   if (perfOn) perfHUD.style.display = "block";
   function togglePerf() {
      perfOn = !perfOn;
      perfHUD.style.display = perfOn ? "block" : "none";
      if (!perfOn) { perfTimes.length = 0; perfLast = 0; }
   }
   var perfKey = function (e) {
      if (e.key === "F3") { e.preventDefault(); togglePerf(); }
      else if (e.key === "F4") { e.preventDefault(); var sum = window.__perfSummary || "perf: (no samples yet)"; if (import.meta.env.DEV) console.log(sum); try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(sum).catch(function(){}); } catch (er) {} var orig = perfHUD.innerHTML; perfHUD.innerHTML = "copied to console"; setTimeout(function(){ perfHUD.innerHTML = orig; }, 1200); }
   };
   window.addEventListener("keydown", perfKey);
   pMainPage.setAttribute("hidden", "");
   pNav.setAttribute("style", "display: none");
   pGameArea.removeAttribute("hidden");

   var gameLoop;
   // set quit callback
    window.quitGame = function () {
       window.removeEventListener("keydown", perfKey);
       document.removeEventListener("contextmenu", contextMenuHandler);
       if (perfHUD && perfHUD.parentNode) perfHUD.parentNode.removeChild(perfHUD);
       if (touchPauseBtn && touchPauseBtn.parentNode) touchPauseBtn.parentNode.removeChild(touchPauseBtn);
       pGameArea.setAttribute("hidden", "");
       pMainPage.removeAttribute("hidden");
       pNav.removeAttribute("style");
       document.body.classList.remove("gaming");
       // restore page scroll position
       document.body.scrollTop = scrollTop;
       // restore alert function
       window.alert = defaultAlert;
       // cancel the render loop BEFORE destroying the app so the loop doesn't
       // crash on a half-torn-down scene graph
       if (gameLoop) gameLoop = null;
       if (window.animationRequestID) { try { window.cancelAnimationFrame(window.animationRequestID); } catch {} window.animationRequestID = null; }
       // cursor + trail are parented to cursorLayer; destroying the layer recursively destroys its children.
       if (game.cursorLayer) {
         try { game.stage.removeChild(game.cursorLayer); } catch {}
         try { game.cursorLayer.destroy({ children: true }); } catch {}
         game.cursorLayer = null;
         game.cursor = null;
         game.cursorTrail = null;
         game.cursorTrailHead = 0;
       }
       // per pixijs-performance skill: must release global pools to avoid cross-app leakage
       try { window.app.destroy({ removeView: true, releaseGlobalResources: true }); } catch { try { window.app.destroy(true); } catch {} }
       window.app = null;
       // clear stale references so a follow-up launchGame starts from a known state
       window.playback = null;
       try { if (window.game) { window.game.scene = null; window.game.cursorLayer = null; window.game.cursor = null; window.game.cursorTrail = null; window.game.cursorTrailHead = 0; } } catch {}
    };

   // load playback
   var playback = new Playback(window.game, osu, osu.tracks[trackid]);
   game.scene = playback;
   playback.onload = function () {
      // stop beatmap preview
      let audios = document.getElementsByTagName("audio");
      for (let i = 0; i < audios.length; ++i)
         if (audios[i].softstop) audios[i].softstop();
   };
   playback.load(); // load audio

   // start main loop
   var perfTimes = [], perfLast = 0, perfUI = 0, perfDropped = 0;
   gameLoop = function (timestamp) {
      if (game.scene) {
         game.scene.render(timestamp);
      }
       if (game.cursor) {
          // Handle cursor
          game.cursor.x = (game.mouseX / 512) * gfx.width + gfx.xoffset;
          game.cursor.y = (game.mouseY / 384) * gfx.height + gfx.yoffset;
          // No Scope (NS): hide cursor unless a key/mouse button is down
          if (game.noscope) {
             game.cursor.visible = !!game.down;
             if (game.cursorMiddle) game.cursorMiddle.visible = !!game.down;
          }
          if (game.cursorMiddle) {
             game.cursorMiddle.x = game.cursor.x;
             game.cursorMiddle.y = game.cursor.y;
             if (window.game && window.game.skinCursorRotate) game.cursorMiddle.rotation += 0.02 * (window.currentFrameInterval || 16.67) / 16.67;
          }
          // CursorRotate: spin cursor if skin.ini says so
          if (window.game && window.game.skinCursorRotate) {
             game.cursor.rotation += 0.02 * (window.currentFrameInterval || 16.67) / 16.67;
          }
           // CursorExpand: pulse scale on click (game.down, not game.mouseDown which is never set)
           if (window.game && window.game.skinCursorExpand) {
              var targetScale = (game.down ? 1.3 : 1.0) * 0.3 * effectiveCursorSize;
              var lerpFactor = 1 - Math.exp(-(window.currentFrameInterval || 16.67) / 16.67 * 0.3);
              game.cursor.scale.x += (targetScale - game.cursor.scale.x) * lerpFactor;
             game.cursor.scale.y = game.cursor.scale.x;
             if (game.cursorMiddle) {
                var midScale = 0.15 * effectiveCursorSize * (game.down ? 1.3 : 1.0);
                game.cursorMiddle.scale.set(midScale);
             }
          }
         // cursor trail: write the newest position, fade the rest by age
         if (game.cursorTrail) {
            let N = game.cursorTrail.length;
            let h = game.cursorTrailHead;
            game.cursorTrail[h].x = game.mouseX;
            game.cursorTrail[h].y = game.mouseY;
            game.cursorTrailHead = (h + 1) % N;
            for (let i = 0; i < N; i++) {
               let entry = game.cursorTrail[i];
               let age = (h - i + N) % N;
               entry.sprite.x =
                  (entry.x / 512) * gfx.width + gfx.xoffset;
               entry.sprite.y =
                  (entry.y / 384) * gfx.height + gfx.yoffset;
                entry.sprite.alpha = Math.max(0, 0.5 * (1 - age / N));
             }
          }
          // v8: cursor layer stays on top via zIndex=999 + sortableChildren — no reparent needed
       }
       app.renderer.render(game.stage);
      // Phase 6 frame-timing sample (only when the perf HUD is on)
      if (perfOn) {
         var now = performance.now();
         if (perfLast) {
            perfTimes.push(now - perfLast);
            if (perfTimes.length > 240) perfTimes.shift();
         }
         perfLast = now;
         if (now - perfUI > 250) {
            perfUI = now;
            var pcts = perfTimes.slice().sort(function (a, b) { return a - b; });
            var pct = function (arr, q) { return arr.length ? arr[Math.floor((arr.length - 1) * q)] : 0; };
            var fps = perfTimes.length ? 1000 / (perfTimes.reduce(function (a, b) { return a + b; }, 0) / perfTimes.length) : 0;
            var p50 = pct(pcts, 0.5), p95 = pct(pcts, 0.95), p99 = pct(pcts, 0.99);
            if (p95 > 33) perfDropped++;
            perfHUD.innerHTML = "FPS " + fps.toFixed(0) + " · p50 " + p50.toFixed(1) + "ms · <b style=\"" + (p95 > 16.6 ? "color:#f86" : "color:#7fd") + "\">p95 " + p95.toFixed(1) + "ms</b> · p99 " + p99.toFixed(1) + "ms · drop " + perfDropped;
            var meta = (window.playback && window.playback.track && window.playback.track.metadata) ? (window.playback.track.metadata.Title + " [" + window.playback.track.metadata.Version + "]") : "?";
            window.__perfSummary = "webosu v8 perf · " + meta + " · FPS " + fps.toFixed(0) + " p50 " + p50.toFixed(1) + "ms p95 " + p95.toFixed(1) + "ms p99 " + p99.toFixed(1) + "ms drop " + perfDropped + (p95 <= 16.6 ? " [BUDGET PASS]" : " [BUDGET FAIL]");
         }
      }
      window.animationRequestID = window.requestAnimationFrame(gameLoop);
   };
   window.animationRequestID = window.requestAnimationFrame(gameLoop);
}

// launch a beatmap in replay mode, driving input from recorded frames
export function launchReplay(osublob, beatmapid, version, frames) {
   window.__replayFrames = frames || null;
   launchGame(osublob, beatmapid, version);
}
export function launchGame(osublob, beatmapid, version) {
   llog("launchgame", "launchGame", { beatmapid, version, blobSize: osublob?.size });
   if (window.game) window.game.replayMode = !!window.__replayFrames;
   window.lastPlayedOszBlob = osublob;
   window.lastPlayedBeatmapId = beatmapid;
   window.lastPlayedVersion = version;

   // Use Web Worker for unzip + parse (eliminates main-thread freeze)
   if (!window._beatmapWorker) {
      window._beatmapWorker = new Worker(new URL("./beatmap-worker.js", import.meta.url), { type: "module" });
      // assign onmessage ONCE — uses a pending-request pattern to handle rapid re-launches
      window._beatmapWorker._pending = { beatmapid, version };
      window._beatmapWorker.onmessage = (e) => {
         const msg = e.data;
         const pending = window._beatmapWorker._pending;
         if (!pending) return;
         if (msg.type === "progress") {
            const el = document.getElementById("beatmap-loading-text");
            if (el) {
               if (msg.stage === "unzip") el.textContent = "Unzipping...";
               else if (msg.stage === "parse") el.textContent = "Parsing beatmap...";
            }
         } else if (msg.type === "result") {
            window._beatmapWorker._pending = null;
            const bid = pending.beatmapid, ver = pending.version;
            llog("launchgame", "worker parsed", msg.tracks.length, "tracks");
            // rehydrate curves + re-link timing
            for (const track of msg.tracks) {
               for (const hit of track.hitObjects) {
                  if (hit.curve && hit.curve.curve && hit.curve.curve.length >= 2) {
                     const curve = hit.curve.curve;
                     const ncurve = hit.curve.ncurve || curve.length - 1;
                     hit.curve.pointAt = (t) => {
                        const indexF = t * ncurve;
                        const idx = Math.floor(indexF);
                        if (idx >= ncurve) return { x: curve[ncurve].x, y: curve[ncurve].y };
                        if (idx < 0) return { x: curve[0].x, y: curve[0].y };
                        const p1 = curve[idx], p2 = curve[idx + 1];
                        if (!p1 || !p2) return { x: curve[ncurve].x, y: curve[ncurve].y };
                        const lt = indexF - idx;
                        return { x: p1.x + (p2.x - p1.x) * lt, y: p1.y + (p2.y - p1.y) * lt };
                     };
                     hit.curve.pointAtInto = (t, out) => {
                        const indexF = t * ncurve;
                        const idx = Math.floor(indexF);
                        if (idx >= ncurve) { out.x = curve[ncurve].x; out.y = curve[ncurve].y; }
                        else if (idx < 0) { out.x = curve[0].x; out.y = curve[0].y; }
                        else {
                           const p1 = curve[idx], p2 = curve[idx + 1];
                           if (!p1 || !p2) { out.x = curve[ncurve].x; out.y = curve[ncurve].y; }
                           else {
                              const lt = indexF - idx;
                              out.x = p1.x + (p2.x - p1.x) * lt;
                              out.y = p1.y + (p2.y - p1.y) * lt;
                           }
                        }
                        return out;
                     };
                  } else if (hit.curve) {
                     const start = { x: hit.x, y: hit.y };
                     hit.curve.pointAt = () => start;
                     hit.curve.pointAtInto = (t, out) => { out.x = start.x; out.y = start.y; return out; };
                  }
                  if (hit.timingIndex != null) {
                     hit.timing = track.timingPoints[hit.timingIndex];
                  }
               }
            }
            // build minimal zip shim for getCoverSrc + load_mp3
            const files = msg.files || {};
            const zipShim = {
               children: Object.keys(files).map(n => ({ name: n })),
               getChildByName: (name) => {
                  const lower = name.toLowerCase();
                  return files[lower] ? {
                     name: lower,
                     getBlob: (type, cb) => cb(new Blob([files[lower]], { type })),
                     getText: (cb) => cb(new TextDecoder().decode(files[lower])),
                  } : null;
               },
            };
            // build Osu facade
            const osu = {
               zip: zipShim,
               tracks: msg.tracks,
               audio: null,
               ondecoded: null,
               onready: null,
               onerror: null,
               getCoverSrc: function(img) {
                  try {
                     // events are line.split(",") arrays: ["0","0","0","\"bg.jpg\"","0","0"]
                     // or ["Background","0","\"bg.jpg\"","0","0"] — find the filename at index 2 or 3
                     let file = null;
                     for (const ev of this.tracks[0].events) {
                        const evType = (ev[0]||"").trim();
                        if (evType === "0" || evType === "Background") {
                           // standard: 0,x-offset,y-offset,"filename",x,y
                           file = ev[3] || ev[2];
                           break;
                        }
                     }
                     if (file) {
                        file = file.replace(/^"|"$/g, "");
                        var entry = zipShim.getChildByName(file);
                     }
                  } catch { entry = null; }
                   if (entry) {
                     const ext = (file.split(".").pop() || "").toLowerCase();
                     const mime = ext === "png" ? "image/png" : ext === "bmp" ? "image/bmp" : "image/jpeg";
                     entry.getBlob(mime, (blob) => {
                        const url = URL.createObjectURL(blob);
                        img.src = url;
                        img.addEventListener("load", () => { try { URL.revokeObjectURL(url); } catch {} }, { once: true });
                     });
                  } else img.src = "img/defaultbg.jpg";
               },
               requestStar: function() {
                  try {
                     const sid = (this.tracks[0].metadata && this.tracks[0].metadata.BeatmapSetID) || 0;
                     if (!sid) return;
                     let xhr = new XMLHttpRequest();
                     xhr.open("GET", "https://api.sayobot.cn/beatmapinfo?1=" + sid);
                     xhr.responseType = "text";
                     xhr.onload = () => {
                        // sayobot can return HTML / plain text on 5xx; the only
                        // valid response is JSON. Wrap so a non-JSON payload
                        // doesn't blow up the entire onload handler.
                        let info;
                        try { info = JSON.parse(xhr.response); } catch { return; }
                        if (!info || info.status != 0 || !Array.isArray(info.data)) return;
                        for (let d of info.data) for (let t of this.tracks) if (t.metadata && t.metadata.BeatmapID == d.bid) {
                           if (typeof d.star === "number") t.difficulty.star = d.star;
                           if (typeof d.length === "number") t.length = d.length;
                        }
                     };
                     xhr.onerror = () => {};
                     xhr.send();
                  } catch {}
               },
               filterTracks: function() { this.tracks = this.tracks.filter(t => t.general.Mode == 0); },
               sortTracks: function() { this.tracks.sort((a,b) => a.difficulty.OverallDifficulty - b.difficulty.OverallDifficulty); },
               load_mp3: function(track) {
                  track = track || this.tracks[0];
                  const audioName = (track.general.AudioFilename || "").toLowerCase();
                  const entry = zipShim.getChildByName(audioName);
                  if (!entry) { if (this.onerror) this.onerror("Audio file not found: " + audioName); return; }
                  entry.getBlob("audio/mpeg", (blob) => {
                     var reader = new FileReader();
                     reader.onload = (e) => {
                        this.audio = new OsuAudio(audioName, e.target.result, () => { if (this.onready) this.onready(); });
                     };
                     reader.readAsArrayBuffer(blob);
                  });
               },
            };
            // remove loading overlay before launching (parse complete)
            const overlay = document.getElementById("beatmap-loading-overlay");
            if (overlay) overlay.remove();
            launchOSU(osu, bid, ver);
            // fetch star ratings in the background (non-blocking)
            try { osu.requestStar(); } catch {}
         } else if (msg.type === "error") {
            window._beatmapWorker._pending = null;
            // remove loading overlay on error
            const overlay = document.getElementById("beatmap-loading-overlay");
            if (overlay) overlay.remove();
            lerror("launchgame", "worker parse error", msg.message);
            // Use the foreground ErrorPopup when the Vue shell has wired it up;
            // otherwise fall back to a browser alert so the error is never silent.
            if (typeof window.__showErrorPopup === "function") {
               window.__showErrorPopup("Could not parse beatmap: " + msg.message, "Beatmap failed to load");
            } else {
               alert("Could not parse beatmap: " + msg.message);
            }
         }
      };
   } else {
      // worker already exists — update pending request
      window._beatmapWorker._pending = { beatmapid, version };
   }
   const worker = window._beatmapWorker;

   // Wrap the arrayBuffer conversion so a malformed/empty .osu blob doesn't
   // surface as an uncaught promise rejection (e.g. blob.arrayBuffer() throws
   // on a corrupt Blob). Surface via the foreground ErrorPopup.
   Promise.resolve().then(() => osublob.arrayBuffer()).then((ab) => {
      if (!ab || ab.byteLength === 0) throw new Error("empty beatmap blob");
      worker.postMessage({ type: "parse", buffer: ab }, [ab]);
   }).catch((err) => {
      lerror("launchgame", "arrayBuffer failed", err);
      if (typeof window.__showErrorPopup === "function") {
         try { window.__showErrorPopup("Could not read beatmap data: " + (err.message || err), "Beatmap failed to load"); } catch {}
      }
      const overlay = document.getElementById("beatmap-loading-overlay");
      if (overlay) overlay.remove();
   });
}

