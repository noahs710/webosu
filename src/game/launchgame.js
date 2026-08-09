import { FS } from "./zipfs.js";
import Osu from "./osu.js";
import { log as llog, warn as lwarn, error as lerror } from "./logger.js";
export async function launchOSU(osu, beatmapid, version) {
   llog("launchgame", "launchOSU", { beatmapid, version, tracks: osu.tracks?.length });
   // select track
   let trackid = -1;
   // mode can be 0 or undefined
   for (let i = 0; i < osu.tracks.length; i++) {
      if (
         osu.tracks[i].metadata.BeatmapID == beatmapid ||
         (!osu.tracks[i].mode && osu.tracks[i].metadata.Version == version)
      ) {
         trackid = i;
      }
   }
   if (trackid == -1) {
      lerror("launchgame", "No such track", { beatmapid, version, available: osu.tracks?.map(t=>({id: t.metadata.BeatmapID, ver: t.metadata.Version})) });
      return;
   }
   llog("launchgame", "selected track", trackid, osu.tracks[trackid]?.metadata);
   // prevent launching multiple times
   if (window.app) { lwarn("launchgame", "app already exists, ignoring launch"); return; }
   llog("launchgame", "Launching PIXI app", { beatmapid, version, trackid });
   // launch PIXI app
   let app = (window.app = new PIXI.Application());
   await app.init({
      width: window.innerWidth,
      height: window.innerHeight,
      resolution: (window.game.overridedpi ? window.game.dpiscale : window.devicePixelRatio) || 1,
      background: 0x111111,
      autoDensity: true,
   });
   
   

   // remember where the page is scrolled to
   let scrollTop = document.body.scrollTop;
   // save alert function and replace with silent alert to prevent pop-up in game
   let defaultAlert = window.alert;
   window.alert = function (msg) {
      console.log("IN-GAME ALERT " + msg);
   };
   // get ready for gaming
   document.addEventListener("contextmenu", function (e) {
      e.preventDefault();
      return false;
   });
   document.body.classList.add("gaming");
   // update game settings
   if (window.gamesettings) {
      window.gamesettings.refresh();
      window.gamesettings.loadToGame();
   }

   // load cursor
   if (!game.showhwmouse || game.autoplay || game.replayMode) {
      // cursor + trail live in a dedicated top layer so we never re-parent
      // individual sprites each frame (render win: cursor-trail z-order fix).
      // Trail sprites keep a fixed back-to-front order; the cursor is added
      // last so it renders above the trail.
      game.cursorLayer = new PIXI.Container();
      game.stage.addChild(game.cursorLayer);
      game.cursor = new PIXI.Sprite(Skin["cursor.png"]);
      game.cursor.anchor.x = game.cursor.anchor.y = 0.5;
      var effectiveCursorSize = (window.game && window.game.skinCursorSize) ? window.game.skinCursorSize : game.cursorSize;
      game.cursor.scale.x = game.cursor.scale.y = 0.3 * effectiveCursorSize;
      // cursor trail: a ring buffer of recent positions fading behind the cursor
      game.cursorTrail = [];
      for (let i = 0; i < 8; i++) {
         let trailTex = (Skin["cursortrail.png"]) ? Skin["cursortrail.png"] : Skin["cursor.png"];
         let t = new PIXI.Sprite(trailTex);
         t.anchor.x = t.anchor.y = 0.5;
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
   // on-screen pause button (touch-accessible; ESC isn't available on touchscreens)
   var pauseBtn = document.createElement("button");
   pauseBtn.textContent = "\u23f8"; // ⏸
   pauseBtn.setAttribute("aria-label", "Pause");
   pauseBtn.title = "Pause (Esc)";
   Object.assign(pauseBtn.style, {
      position: "fixed", top: "8px", right: "10px", zIndex: "50",
      width: "44px", height: "44px", // touch-target sized
      borderRadius: "10px",
      background: "rgba(20,20,30,.55)", color: "#ececf4",
      border: "1px solid rgba(255,255,255,.18)",
      font: "600 20px/1 system-ui, sans-serif", cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "center",
      backdropFilter: "blur(4px)", webkitBackdropFilter: "blur(4px)",
      userSelect: "none", touchAction: "manipulation",
   });
   pauseBtn.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      if (!window.playback) return;
      if (window.game && window.game.paused) window.playback.resume();
      else window.playback.pause();
   });
   pGameArea.appendChild(pauseBtn);
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
      else if (e.key === "F4") { e.preventDefault(); var sum = window.__perfSummary || "perf: (no samples yet)"; console.log(sum); try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(sum).catch(function(){}); } catch (er) {} var orig = perfHUD.innerHTML; perfHUD.innerHTML = "copied to console"; setTimeout(function(){ perfHUD.innerHTML = orig; }, 1200); }
   };
   window.addEventListener("keydown", perfKey);
   pMainPage.setAttribute("hidden", "");
   pNav.setAttribute("style", "display: none");
   pGameArea.removeAttribute("hidden");

   var gameLoop;
   // set quit callback
   window.quitGame = function () {
      window.removeEventListener("keydown", perfKey);
      if (perfHUD && perfHUD.parentNode) perfHUD.parentNode.removeChild(perfHUD);
      if (pauseBtn && pauseBtn.parentNode) pauseBtn.parentNode.removeChild(pauseBtn);
      pGameArea.setAttribute("hidden", "");
      pMainPage.removeAttribute("hidden");
      pNav.removeAttribute("style");
      document.body.classList.remove("gaming");
      // restore page scroll position
      document.body.scrollTop = scrollTop;
      // restore alert function
      window.alert = defaultAlert;
      // cursor + trail are parented to cursorLayer; destroying the layer recursively destroys its children.
      if (game.cursorLayer) {
         game.stage.removeChild(game.cursorLayer);
         game.cursorLayer.destroy({ children: true });
         game.cursorLayer = null;
         game.cursor = null;
         game.cursorTrail = null;
         game.cursorTrailHead = 0;
      }
      window.app.destroy(true);
      window.app = null;
      gameLoop = null;
      window.cancelAnimationFrame(window.animationRequestID);
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
         // CursorRotate: spin cursor if skin.ini says so
         if (window.game && window.game.skinCursorRotate) {
            game.cursor.rotation += 0.02;
         }
         // CursorExpand: pulse scale on click
         if (window.game && window.game.skinCursorExpand) {
            var targetScale = (game.mouseDown ? 1.3 : 1.0) * 0.3 * effectiveCursorSize;
            game.cursor.scale.x += (targetScale - game.cursor.scale.x) * 0.3;
            game.cursor.scale.y = game.cursor.scale.x;
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
         // keep the cursor layer above gameplay/HUD with one re-parent per
         // frame instead of N+1 per-sprite re-parents
         // capture parent first: removeChild nulls .parent in Pixi v8
         let cl = game.cursorLayer;
         let clParent = cl && cl.parent;
         if (clParent) {
            clParent.removeChild(cl);
            clParent.addChild(cl);
         }
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
   // replay playback: frames were stashed by launchReplay before calling us
   if (window.game) window.game.replayMode = !!window.__replayFrames;
   // unzip osz & parse beatmap
   let fs = new FS();
   window.lastPlayedOszBlob = osublob;
   window.lastPlayedBeatmapId = beatmapid;
   window.lastPlayedVersion = version;
   fs.root.importBlob(
      osublob,
      function () {
         llog("launchgame", "osz unzipped", fs.root.children?.length, "files");
         let osu = new Osu(fs.root);
         osu.ondecoded = function () {
            llog("launchgame", "osu decoded", osu.tracks.length, "tracks");
            osu.tracks.forEach((t,i)=> llog("launchgame", `track ${i}`, t.metadata.Title, t.metadata.Version, t.hitObjects.length, "hits"));
            launchOSU(osu, beatmapid, version);
         };
         osu.onerror = function (msg) {
            lerror("launchgame", "osu parse error", msg);
         };
         try { osu.load(); } catch (e) { lerror("launchgame", "osu.load threw", e); }
      },
      function (err) {
         lerror("launchgame", "unzip failed", err);
      }
   );
}

