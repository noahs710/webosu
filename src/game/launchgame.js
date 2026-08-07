import { FS } from "./zipfs.js";
import Osu from "./osu.js";
export async function launchOSU(osu, beatmapid, version) {
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
      console.error("No such track");
      return;
   }
   // prevent launching multiple times
   if (window.app) return;
   console.log("Launching PIXI app");
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
      game.cursor.scale.x = game.cursor.scale.y = 0.3 * game.cursorSize;
      // cursor trail: a ring buffer of recent positions fading behind the cursor
      game.cursorTrail = [];
      for (let i = 0; i < 8; i++) {
         let t = new PIXI.Sprite(Skin["cursor.png"]);
         t.anchor.x = t.anchor.y = 0.5;
         t.scale.x = t.scale.y = 0.3 * game.cursorSize;
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
   pMainPage.setAttribute("hidden", "");
   pNav.setAttribute("style", "display: none");
   pGameArea.removeAttribute("hidden");

   var gameLoop;
   // set quit callback
   window.quitGame = function () {
      pGameArea.setAttribute("hidden", "");
      pMainPage.removeAttribute("hidden");
      pNav.removeAttribute("style");
      document.body.classList.remove("gaming");
      // restore page scroll position
      document.body.scrollTop = scrollTop;
      // restore alert function
      window.alert = defaultAlert;
      // TODO application level clean up
      // cursor + trail are parented to cursorLayer; destroying the layer
      // recursively destroys its children.
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
   gameLoop = function (timestamp) {
      if (game.scene) {
         game.scene.render(timestamp);
      }
      if (game.cursor) {
         // Handle cursor
         game.cursor.x = (game.mouseX / 512) * gfx.width + gfx.xoffset;
         game.cursor.y = (game.mouseY / 384) * gfx.height + gfx.yoffset;
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
   // replay playback: frames were stashed by launchReplay before calling us
   if (window.game) window.game.replayMode = !!window.__replayFrames;
   // unzip osz & parse beatmap
   let fs = new FS();
   fs.root.importBlob(
      osublob,
      function () {
         let osu = new Osu(fs.root);
         osu.ondecoded = function () {
            launchOSU(osu, beatmapid, version);
         };
         osu.onerror = function () {
            console.error("osu parse error");
         };
         osu.load();
      },
      function (err) {
         console.error("unzip failed");
      }
   );
}

