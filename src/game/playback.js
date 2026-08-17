import Osu from "./osu.js";
import setPlayerActions from "./playerActions.js";
import SliderMesh from "./SliderMesh.js";
import ScoreOverlay from "./overlay/score.js";
import VolumeMenu from "./overlay/volume.js";
import LoadingMenu from "./overlay/loading.js";
import BreakOverlay from "./overlay/break.js";
import ProgressOverlay from "./overlay/progress.js";
import ErrorMeterOverlay from "./overlay/hiterrormeter.js";
import { ModRegistry } from "./mods/index.js";
import { lazerSpinnerRpm, lazerHitWindows, lazerDifficultyRange } from "./lazerHpTables.js";
import SliderJudge from "./slider-judge.js";
import SliderScorer from "./slider-scorer.js";
import {
   log as glog,
   warn as gwarn,
   error as gerror,
   debug as gdebug,
} from "./logger.js";

function clamp01(a) {
   return Math.min(1, Math.max(0, a));
}

function colorLerp(rgb1, rgb2, t) {
   let r = (1 - t) * ((rgb1 >> 16) / 255) + t * ((rgb2 >> 16) / 255);
   let g =
      (1 - t) * (((rgb1 >> 8) & 255) / 255) + t * (((rgb2 >> 8) & 255) / 255);
   let b = (1 - t) * ((rgb1 & 255) / 255) + t * ((rgb2 & 255) / 255);
   return (
      (Math.round(r * 255) << 16) |
      (Math.round(g * 255) << 8) |
      Math.round(b * 255)
   );
}

function repeatclamp(a) {
   a %= 2;
   return a > 1 ? 2 - a : a;
}

function Playback(game, osu, track) {
   var self = this;
   window.playback = this;
   self._generation = (self._generation || 0) + 1; // invalidate stale async callbacks on retry
   self.game = game;
   self.osu = osu;
   self.track = track;
   self.background = null;
   self.started = false;
   self.upcomingHits = [];
   // render win #4: pool hit-circle sprites by texture (base/circle/glow/
   // burst/approach) to avoid per-object create/destroy churn + GC. A pooled
   // sprite is fully reset in newHitSprite so it is identical to a fresh one.
   self._spritePool = new Map();
   self._hitBursts = [];
   self._comboFlashes = [];
   self._judgeTextPool = [];
   self._POOL_MAX = 48;
   // release a sprite back to the texture-keyed pool (capped to prevent unbounded growth)
   self._releaseToPool = function (sprite) {
      if (!sprite._pooledTex) {
         sprite.destroy();
         return;
      }
      let arr = self._spritePool.get(sprite._pooledTex);
      if (!arr) {
         arr = [];
         self._spritePool.set(sprite._pooledTex, arr);
      }
      if (arr.length < self._POOL_MAX) {
         sprite.visible = false;
         arr.push(sprite);
      } else sprite.destroy();
   };
   // reusable point objects to avoid per-frame allocation in slider update
   self._tmpPt1 = { x: 0, y: 0 };
   self._tmpPt2 = { x: 0, y: 0 };
   // reusable mouse-predict object to avoid per-frame allocation
   self._tmpMouse = { x: 0, y: 0, r: 0 };
   self.replayFrames = []; // input log uploaded to the webosu leaderboard
   self.replayPlayback = window.__replayFrames || null; // frames to play back
   window.__replayFrames = null;
   self.replayMode = !!self.replayPlayback;
   // creating a copy of hitobjects
   self.hits = [];
   self.track.hitObjects.forEach(function (o) {
      self.hits.push(Object.assign({}, o));
   });
   self.offset = 0;
   self.currentHitIndex = 0; // index for all hit objects
   // Scrub detector: tracks the previous frame's game time so we can detect
   // audio-position jumps (scrub / resume / lead-in seek). A healthy frame
   // advances by < 1 frame (~33ms); anything > 200ms means the clock jumped
   // (the user seeked, or the audio sought to the first hit during lead-in).
   // On a scrub frame, miss checks are skipped so the user isn't penalized
   // for hits they never had a chance to play. This is the scrub-only guard
   // — the per-frame miss CAP (MAX_MISSES_PER_FRAME) that caused the original
   // "burst-miss on first tap" bug is NOT restored.
   self._lastGameTime = -1;
   self._scrubFrame = false;
   self.ended = false;
   // Signature of the active mod set when the user last paused. Used by btn_continue
   // to detect that a mod changed while paused and force a retry so the change
   // (DT/NC/HR/EZ/DA) actually takes effect on resume.
   self._modsAtPause = null;
   self._modsChangedSincePause = false;
   // mods
   self.autoplay = game.autoplay;
   self.modhidden = game.hidden;
   self.playbackRate = 1.0;
   // DT/NC: 1.5x speed. NC is a DT subclass (game.doubletime is set by both DT and NC).
   // The NC pitch shift is applied audio-side in ModNightcore.applyToAudio.
   if (self.game.doubletime) self.playbackRate *= 1.5;
   if (self.game.daycore) self.playbackRate *= 0.75;
   // Adaptive Speed: start at 1.0, adjusted in the render loop based on accuracy
   self._asRecentJudgements = []; // rolling window of recent results
   self._asCurrentRate = 1.0;
   self.hideNumbers = game.hideNumbers;
   self.hideGreat = game.hideGreat;
   self.hideFollowPoints = game.hideFollowPoints;
   self.showTapIndicator = game.showTapIndicator !== false;
   self.hideFollowPoints = game.hideFollowPoints;

   self.approachScale = 3;
   self.audioReady = false;
   if (self.hits.length === 0) {
      gerror("playback", "empty beatmap — no hit objects");
      self.endTime = 0;
      this.wait = 0;
      self.skipTime = 0;
      return;
   } else {
      self.endTime = self.hits[self.hits.length - 1].endTime + 1500;
      this.wait = Math.max(0, 1500 - this.hits[0].time);
      self.skipTime = this.hits[0].time / 1000 - 3;
   }
   self.skipped = false;

   self.osu.onready = function () {
      self.loadingMenu.hide();
      self.audioReady = true;
      if (self.onload) self.onload();
      // start() defers music to self.backgroundFadeTime + self.wait. If audio
      // decoded but the source buffer is missing (corrupt mp3 — see osu-audio
      // null-guard), start() would set a stale position then loop forever.
      try {
         self.start();
      } catch (e) {
         gerror("playback", "start() failed", e);
      }
   };
   self.osu.onerror = function (msg) {
      // The Osu facade signals missing/corrupt audio here. Show a foreground
      // error so the user isn't stuck on a loading menu, and mark audio as
      // ready (no audio = nothing will play, but the game can still load
      // visuals and let the user quit gracefully).
      gerror("playback", "osu.onerror", msg);
      self.loadingMenu.hide();
      if (typeof window.__showErrorPopup === "function") {
         try {
            window.__showErrorPopup(
               String(msg || "Audio could not be loaded."),
               "Missing audio",
            );
         } catch {}
      }
      // Avoid leaving the user in a stuck-loading state
      const overlay = document.getElementById("beatmap-loading-overlay");
      if (overlay) overlay.remove();
      self.audioReady = true;
   };
   self.load = function () {
      try {
         self.osu.load_mp3(self.track);
      } catch (e) {
         gerror("playback", "load_mp3 threw", e);
         self.osu.onerror &&
            self.osu.onerror("Failed to load audio: " + (e.message || e));
      }
   };

   var gfx = (window.gfx = {}); // game field area
   self.gamefield = new PIXI.Container();
   self.gamefield.eventMode = "none";
   // v8: sortableChildren+zIndex replaces manual addChildAt binary-search (O(n) shifts → O(1) append + sort)
   self.gamefield.sortableChildren = true;
   // culling: gamefield is 512×384 osu-pixel space — cull objects outside it
   self.gamefield.cullable = true;
   self.gamefield.cullArea = new PIXI.Rectangle(0, 0, 512, 384);
   try {
      const cp = new URLSearchParams(window.location.search).get("cull");
      if (cp === "false") self.gamefield.cullable = false;
      if (import.meta.env.DEV && cp)
         glog("playback", "cull gamefield", {
            cullable: self.gamefield.cullable,
            cullArea: self.gamefield.cullArea,
         });
   } catch {}
   // Recommended field size = the playfield as it renders on a 1920x1080
   // screen (80% fit = 1152x864). The field/notes scale with the screen only
   // when the screen is smaller than this recommended minimum (touchscreens /
   // small windows); on larger screens the field is capped at the recommended
   // size so notes don't blow up. Full touch support: small screens scale to
   // The playfield is 512x384 osu-pixels. Fit to screen at 80%, capped at
   // recommended max (1152px) so notes don't blow up on large monitors.
   // On mobile (< 600px wide) allow full 80% fit without the cap.
   // Never upscale past monitor native — renderer resolution is already
   // capped at min(2, devicePixelRatio) in launchgame.js.
   var RECOMMEND_W = 1152;
   self.calcSize = function () {
      gfx.width = game.window.innerWidth;
      gfx.height = game.window.innerHeight;
      if (gfx.width / 512 > gfx.height / 384)
         gfx.width = (gfx.height / 384) * 512;
      else gfx.height = (gfx.width / 512) * 384;
      gfx.width *= 0.8;
      gfx.height *= 0.8;
      var isMobile = game.window.innerWidth < 600;
      if (!isMobile && gfx.width > RECOMMEND_W) {
         gfx.width = RECOMMEND_W;
         gfx.height = (RECOMMEND_W * 384) / 512;
      }
      gfx.xoffset = (game.window.innerWidth - gfx.width) / 2;
      gfx.yoffset = (game.window.innerHeight - gfx.height) / 2;
      self.gamefield.x = gfx.xoffset;
      self.gamefield.y = gfx.yoffset;
      self.gamefield.scale.set(gfx.width / 512);
   };
   self.calcSize();
   game.mouseX = 512 / 2;
   game.mouseY = 384 / 2;
   self.loadingMenu = new LoadingMenu(
      {
         width: game.window.innerWidth,
         height: game.window.innerHeight,
      },
      track,
   );
   self.volumeMenu = new VolumeMenu({
      width: game.window.innerWidth,
      height: game.window.innerHeight,
   });
   self.breakOverlay = new BreakOverlay({
      width: game.window.innerWidth,
      height: game.window.innerHeight,
   });
   self.progressOverlay = new ProgressOverlay(
      {
         width: game.window.innerWidth,
         height: game.window.innerHeight,
      },
      this.hits[0].time - 1500,
      this.hits[this.hits.length - 1].endTime,
   );

   var resizeCallback = function () {
      window.app.renderer.resize(window.innerWidth, window.innerHeight);
      self.calcSize();
      if (import.meta.env.DEV) {
         try {
            const b = self.gamefield?.getBounds?.();
            const cull = self.gamefield?.cullable;
            glog("playback", "cull spike resize", {
               cullable: cull,
               cullArea: self.gamefield?.cullArea,
               bounds: b,
               gfx,
               sliderBounds: self.hits?.[0]?.body?.getBounds?.(),
            });
         } catch {}
      }
      self.scoreOverlay.resize({
         width: window.innerWidth,
         height: window.innerHeight,
      });
      self.errorMeter.resize({
         width: window.innerWidth,
         height: window.innerHeight,
      });
      self.loadingMenu.resize({
         width: window.innerWidth,
         height: window.innerHeight,
      });
      self.volumeMenu.resize({
         width: window.innerWidth,
         height: window.innerHeight,
      });
      self.breakOverlay.resize({
         width: window.innerWidth,
         height: window.innerHeight,
      });
      self.progressOverlay.resize({
         width: window.innerWidth,
         height: window.innerHeight,
      });

      // FL overlay: force a redraw on resize (the full-screen rect changed)
      if (self.flOverlay) {
         self.flLastCursorX = -9999;
         self.flLastCursorY = -9999;
         self.flLastRadius = -1;
         if (self.flSliderDim) {
            self.flSliderDim.clear();
            self._flDimAlpha = 0;
         }
      }

      if (self.background && self.background.texture) {
         self.background.x = window.innerWidth / 2;
         self.background.y = window.innerHeight / 2;
         self.background.scale.set(
            Math.max(
               window.innerWidth / self.background.texture.width,
               window.innerHeight / self.background.texture.height,
            ),
         );
      }

      SliderMesh.prototype.resetTransform({
         dx: (2 * gfx.width) / window.innerWidth / 512,
         ox: -1 + (2 * gfx.xoffset) / window.innerWidth,
         dy: (-2 * gfx.height) / window.innerHeight / 384,
         oy: 1 - (2 * gfx.yoffset) / window.innerHeight,
      });
   };
   window.addEventListener("resize", resizeCallback);

   var blurCallback = function (e) {
      if (self.audioReady && !self.ended && !self.game.paused) self.pause();
   };
   window.addEventListener("blur", blurCallback);

   // deal with difficulties
   this.OD = track.difficulty.OverallDifficulty;
   this.CS = track.difficulty.CircleSize;
   this.AR = track.difficulty.ApproachRate;
   this.HP = track.difficulty.HPDrainRate;
   if (game.hardrock) {
      this.OD = Math.min(this.OD * 1.4, 10);
      this.CS = Math.min(this.CS * 1.3, 10);
      this.AR = Math.min(this.AR * 1.4, 10);
      this.HP = Math.min(this.HP * 1.4, 10);
   }
   if (game.easy) {
      this.OD = this.OD * 0.5;
      this.CS = this.CS * 0.5;
      this.AR = this.AR * 0.5;
      this.HP = this.HP * 0.5;
   }
   // DifficultyAdjust: override difficulty with the user's custom values
   if (game.difficultyAdjust) {
      if (game.customAR >= 0) this.AR = game.customAR;
      if (game.customCS >= 0) this.CS = game.customCS;
      if (game.customOD >= 0) this.OD = game.customOD;
      if (game.customHP >= 0) this.HP = game.customHP;
   }

   // Mod multipliers via ModRegistry (replaces the hardcoded block).
   // Falls back to the legacy flat-flag computation if the registry isn't loaded.
   let scoreModMultiplier;
   if (window.ModRegistry && ModRegistry.getActive().length) {
      scoreModMultiplier = ModRegistry.scoreMultiplier();
   } else {
      scoreModMultiplier = 1.0;
      if (game.easy) scoreModMultiplier *= 0.5;
      if (game.daycore) scoreModMultiplier *= 0.3;
      if (game.hardrock) scoreModMultiplier *= 1.06;
      if (game.nightcore) scoreModMultiplier *= 1.12;
      if (game.hidden) scoreModMultiplier *= 1.06;
      if (game.nofail) scoreModMultiplier *= 0.5;
      if (game.spunout) scoreModMultiplier *= 0.9;
   }

   self.scoreOverlay = new ScoreOverlay(
      {
         width: game.window.innerWidth,
         height: game.window.innerHeight,
      },
      this.HP,
      scoreModMultiplier,
      {
         nofail: game.nofail,
         suddendeath: game.suddendeath,
         perfect: game.perfect,
         classic: game.classic,
      },
   );
   self.scoreOverlay.onfail = function () {
      if (!self.ended) {
         self.ended = true;
         self.pause = function () {};
         if (self.osu.audio) self.osu.audio.pause();
         self.game.paused = true;
         self.scoreOverlay.visible = false;
         self.scoreOverlay.showSummary(
            self.track.metadata,
            self.errorMeter.record,
            self.retry,
            self.quit,
         );
      }
   };
   // Lazer CS formula (ppy/osu OsuHitObject.cs): R = 32 * (1 - 0.7 * DifficultyRange(CS, 0, 0.5, 1))
   // where DifficultyRange is the two-piece-linear: 0->min, 5->mid, 10->max.
   // At CS=4: R = 23.04; CS=5: R = 16; CS=0: R = 36.16. (The previous (CS-5)/5 linear
   // was wrong for any CS!=5 — 58% too big at CS=4. Audit finding D4.)
   self.circleRadius = 32 * (1 - 0.7 * lazerDifficultyRange(this.CS, 0, 0.5, 1));
   // hitSpriteScale: circle radius / 60 (visible radius of default 128px texture).
   // This scales the sprite so the visual circle has radius = circleRadius.
   // For custom skins, texture normalization via source.resolution handles
   // size differences so /60 stays correct for all skins.
   self.hitSpriteScale = self.circleRadius / 60;
   self.hitRadius = self.circleRadius;
   // Lazer hit windows (when flag on) use floor-0.5 logic; else legacy
   if (window.FEATURES && window.FEATURES.lazerSliderJudging) {
      const w = lazerHitWindows(this.OD);
      self.MehTime = w.meh;
      self.GoodTime = w.ok;
      self.GreatTime = w.great;
   } else {
      self.MehTime = 200 - 10 * this.OD;
      self.GoodTime = 140 - 8 * this.OD;
      self.GreatTime = 80 - 6 * this.OD;
   }
   self.errorMeter = new ErrorMeterOverlay(
      {
         width: game.window.innerWidth,
         height: game.window.innerHeight,
      },
      this.GreatTime,
      this.GoodTime,
      this.MehTime,
   );
   self.approachTime =
      this.AR < 5 ? 1800 - 120 * this.AR : 1950 - 150 * this.AR; // time of sliders/hitcircles and approach circles approaching
   self.approachFadeInTime = Math.min(800, self.approachTime); // duration of approach circles fading in, at beginning of approaching
   for (let i = 0; i < self.hits.length; ++i) {
      let hit = self.hits[i];
      if (self.modhidden && i > 0 && self.hits[i - 1].type != "spinner") {
         // don't hide the first one
         hit.objectFadeInTime = 0.4 * self.approachTime;
         hit.objectFadeOutOffset = -0.6 * self.approachTime;
         hit.circleFadeOutTime = 0.3 * self.approachTime;
      } else {
         hit.enableflash = true;
         hit.objectFadeInTime = Math.min(400, self.approachTime); // duration of sliders/hitcircles fading in, at beginning of approaching
         hit.circleFadeOutTime = 100;
         hit.objectFadeOutOffset = self.MehTime;
      }
   }

   for (let i = 0; i < self.hits.length; ++i) {
      if (self.hits[i].type == "slider") {
         if (self.modhidden && i > 0 && self.hits[i - 1].type != "spinner") {
            self.hits[i].fadeOutOffset = -0.6 * self.approachTime;
            self.hits[i].fadeOutDuration =
               self.hits[i].sliderTimeTotal - self.hits[i].fadeOutOffset;
         } else {
            self.hits[i].fadeOutOffset = self.hits[i].sliderTimeTotal;
            self.hits[i].fadeOutDuration = 300;
         }
      }
   }

   self.glowFadeOutTime = 350;
   self.glowMaxOpacity = 0.5;
   self.flashFadeInTime = 40;
   self.flashFadeOutTime = 120;
   self.flashMaxOpacity = 0.8;
   self.scoreFadeOutTime = 500;
   self.followZoomInTime = 100;
   self.followFadeOutTime = 100;
   self.ballFadeOutTime = 100;
   self.objectDespawnTime = 1500;
   self.backgroundFadeTime = 800;
   self.spinnerAppearTime = self.approachTime;
   self.spinnerZoomInTime = 300;
   self.spinnerFadeOutTime = 150;

   setPlayerActions(self);

   self.game.paused = false;
   this.pause = function () {
      glog(
         "playback",
         "pause requested, audioReady",
         self.audioReady,
         "paused",
         self.game.paused,
      );
      if (!this.osu || !this.osu.audio) return;
      if (this.osu.audio.pause()) {
         // pause music success
         this.game.paused = true;
         let menu = document.getElementById("pause-menu");
         if (!menu) {
            gerror("playback", "pause-menu element not found");
            return;
         }
         menu.removeAttribute("hidden");
         // snapshot the active mod set so btn_continue can detect changes
         try {
            self._modsAtPause = window.ModRegistry
               ? window.ModRegistry.serialize().join(",")
               : "";
            self._modsChangedSincePause = false;
            self.pollModChange = function () {
               if (!self._modsAtPause || !window.ModRegistry) return;
               try {
                  var cur = window.ModRegistry.serialize().join(",");
                  if (cur !== self._modsAtPause)
                     self._modsChangedSincePause = true;
               } catch (e) {}
            };
            if (!self._modsPollTimer)
               self._modsPollTimer = setInterval(self.pollModChange, 250);
         } catch {}
         glog(
            "playback",
            "pause menu shown, hidden removed, z-index",
            getComputedStyle(menu).zIndex,
            "display",
            getComputedStyle(menu).display,
         );
         var btn_continue = document.getElementById("pausebtn-continue");
         var btn_retry = document.getElementById("pausebtn-retry");
         var btn_quit = document.getElementById("pausebtn-quit");
         var btn_mods = document.getElementById("pausebtn-mods");
         btn_continue.onclick = function () {
            const modsChanged = self._modsChangedSincePause;
            const cleared = (function () {
               btn_continue.onclick = null;
               btn_retry.onclick = null;
               btn_quit.onclick = null;
               btn_mods.onclick = null;
               const mp = document.getElementById("pause-mod-panel");
               if (mp) mp.setAttribute("hidden", "");
            })();
            void cleared;
            if (modsChanged) {
               // Mods (DT/NC/HR/EZ/DA) only take effect on a fresh playback — retry so the
               // user actually sees them applied. Without this, clicking Continue just
               // resumes with stale difficulty + audio rate.
               self.game.paused = false;
               menu.setAttribute("hidden", "");
               self.retry();
               return;
            }
            self.resume();
         };
         btn_retry.onclick = function () {
            self.game.paused = false;
            menu.setAttribute("hidden", "");
            self.retry();
         };
         btn_quit.onclick = function () {
            self.game.paused = false;
            menu.setAttribute("hidden", "");
            self.quit();
         };
         // Mods button: toggle the ModSelectPanel overlay in the pause menu
         if (btn_mods) {
            btn_mods.onclick = function () {
               const mp = document.getElementById("pause-mod-panel");
               if (!mp) return;
               if (mp.hasAttribute("hidden")) {
                  // mount the ModSelectPanel via Vue (lazy ESM import)
                  Promise.all([
                     import("../vue/components/ModSelectPanel.vue"),
                     import("vue"),
                  ])
                     .then(([mod, vue]) => {
                        const ModSelectPanel = mod.default;
                        // Defensive: tear down any prior app instance so toggling
                        // mods on/off doesn't leak detached Vue apps and listeners.
                        if (mp.__vueApp) {
                           try {
                              mp.__vueApp.unmount();
                           } catch (e) {}
                        }
                        mp.innerHTML = "";
                        const modApp = vue.createApp(ModSelectPanel);
                        modApp.mount(mp);
                        mp.__vueApp = modApp;
                        mp.removeAttribute("hidden");
                     })
                     .catch((e) => {
                        // Show the panel even on import failure so the user isn't
                        // stuck on a paused screen with a non-functional Mods button.
                        if (typeof window.__showErrorPopup === "function") {
                           try {
                              window.__showErrorPopup(
                                 "Could not open mod panel: " +
                                    (e.message || e),
                                 "Mods panel",
                              );
                           } catch {}
                        }
                        mp.removeAttribute("hidden");
                     });
               } else {
                  // Hide the panel; also unmount the Vue app to free listeners.
                  if (mp.__vueApp) {
                     try {
                        mp.__vueApp.unmount();
                     } catch (e) {}
                     mp.__vueApp = null;
                  }
                  mp.setAttribute("hidden", "");
               }
            };
         }
      }
   };
   this.resume = function () {
      glog("playback", "resume");
      this.osu.audio.play();
      this.game.paused = false;
      const m = document.getElementById("pause-menu");
      if (m) m.setAttribute("hidden", "");
   };

   // adjust volume
   var wheelCallback;
   if (game.allowMouseScroll) {
      wheelCallback = function (e) {
         self.game.masterVolume -= e.deltaY * 0.002;
         if (self.game.masterVolume < 0) {
            self.game.masterVolume = 0;
         }
         if (self.game.masterVolume > 1) {
            self.game.masterVolume = 1;
         }
         if (self.osu && self.osu.audio && self.osu.audio.gain)
            self.osu.audio.gain.gain.value =
               self.game.musicVolume * self.game.masterVolume;
         self.volumeMenu.setVolume(self.game.masterVolume * 100);
      };
      window.addEventListener("wheel", wheelCallback);
   }

   var pauseKeyCallback = function (e) {
      // press esc to pause
      if (
         (e.keyCode === game.ESCkeycode || e.keyCode == game.ESC2keycode) &&
         !self.game.paused
      ) {
         self.pause();
         self.pausing = true; // to prevent resuming at end of first key press
      }
   };
   var resumeKeyCallback = function (e) {
      // press and release esc to pause
      if (
         (e.keyCode === game.ESCkeycode || e.keyCode == game.ESC2keycode) &&
         self.game.paused
      ) {
         if (self.pausing) self.pausing = false;
         else self.resume();
      }
   };
   var skipKeyCallback = function (e) {
      if (e.keyCode === game.CTRLkeycode && !self.game.paused) {
         if (!self.skipped && !self.pausing) self.skip();
      }
   };
   window.addEventListener("keydown", pauseKeyCallback);
   window.addEventListener("keyup", resumeKeyCallback);
   window.addEventListener("keydown", skipKeyCallback);

   this.fadeOutEasing = function (t) {
      // [0..1] -> [1..0]
      if (t <= 0) return 1;
      if (t > 1) return 0;
      return 1 - Math.sin((t * Math.PI) / 2);
   };

   function judgementText(points) {
      switch (points) {
         case 0:
            return "miss";
         case 50:
            return "meh";
         case 100:
            return "good";
         case 300:
            return "great";
         // Defensive: an unknown points value (e.g. a new lazer judgement
         // 0k=Ok/0k miss that gets routed here) would throw and crash
         // invokeJudgement. Treat as a 0-equivalent so the game keeps running.
         default:
            if (import.meta.env.DEV)
               console.warn("judgementText unknown points", points);
            return "meh";
      }
   }

   function judgementColor(points) {
      switch (points) {
         case 0:
            return 0xed1121;
         case 50:
            return 0xffcc22;
         case 100:
            return 0x88b300;
         case 300:
            return 0x66ccff;
         default:
            return 0x66ccff;
      }
   }

   this.createJudgement = function (x, y, finalTime) {
      var useSprites = !!window.Skin?.["hit300.png"];
      var judge;
      if (useSprites) {
         const initTex = window.Skin?.["hit300.png"] || PIXI.Texture.WHITE;
         let arr = self._spritePool.get(initTex);
         judge = arr && arr.length ? arr.pop() : new PIXI.Sprite(initTex);
         if (judge.texture !== initTex || !judge.texture?.valid)
            judge.texture = initTex;
         judge.anchor.set(0.5);
         judge.scale.set(
            0.85 * this.hitSpriteScale,
            0.85 * this.hitSpriteScale,
         );
         judge.baseScaleX = 0.85 * this.hitSpriteScale;
         judge.baseScaleY = 0.85 * this.hitSpriteScale;
         if (initTex === PIXI.Texture.WHITE) judge.tint = 0x66ccff;
         judge.eventMode = "none";
         judge.cullable = false;
         judge._pooledTex = initTex;
         judge._pooledType = "sprite";
      } else {
         judge = self._judgeTextPool.length
            ? self._judgeTextPool.pop()
            : new PIXI.Text({
                 text: "",
                 style: {
                    fontFamily: "Comfortaa",
                    fontSize: 36,
                    fill: "#ffffff",
                 },
              });
         judge.anchor.set(0.5);
         judge.scale.set(1.0 * this.hitSpriteScale, 1.0 * this.hitSpriteScale);
         judge.baseScaleX = 1.0 * this.hitSpriteScale;
         judge.baseScaleY = 1.0 * this.hitSpriteScale;
         judge.eventMode = "none";
         judge.cullable = false;
         judge._pooledType = "text";
      }
      judge.visible = false;
      judge.basex = judge.x = x;
      judge.basey = judge.y = y;
      judge.zIndex = 4;
      judge.points = -1;
      judge.finalTime = finalTime;
      judge.defaultScore = 0;
      judge.useSprites = useSprites;
      return judge;
   };

   this.invokeJudgement = function (judge, points, time) {
      judge.visible = !!(self.game && self.game.showTapIndicator !== false);
      judge.points = points;
      judge.t0 = time;
      if (judge.useSprites) {
         // Map points to skin judgement texture — always set texture, fallback to WHITE tinted
         var texKey = "hit300.png";
         if (points == 0) texKey = "hit0.png";
         else if (points == 50) texKey = "hit50.png";
         else if (points == 100) {
            // lazer Ok judgement: prefer hit100k.png (Ok-specific) over hit100.png
            texKey = window.Skin?.["hit100k.png"]
               ? "hit100k.png"
               : "hit100.png";
         } else if (points == 300) {
            texKey = "hit300.png";
            if (this.fullcombo && window.Skin?.["hit300g.png"])
               texKey = "hit300g.png";
         }
         var tex = window.Skin?.[texKey] || PIXI.Texture.WHITE;
         // Skins that intentionally ship 1×1 judgement textures (e.g. reowoTuna)
         // expect "no judgement sprite"; rendering a 1×1 scaled up produces a
         // visible colored square. Detect and fall back to text mode instead.
         if (tex && tex.source && (tex.source.width <= 2 || tex.source.height <= 2)) {
            tex = PIXI.Texture.WHITE; // forces text fallback below
         }
         // T16: animated judgement sprites. If the skin ships hit*-N.png frames
         // for this judgement type, play them as a PIXI.AnimatedSprite at
         // AnimationFramerate (default 60). The AnimatedSprite is created
         // per-judgement (not pooled) and destroyed when the hit despawns.
         const animFrames = window.Skin?.__hitAnimFrames?.[texKey.replace(".png", "")];
         if (animFrames && animFrames.length > 1 && PIXI.AnimatedSprite) {
            try {
               // Stop + remove any existing animated sprite on this judge
               if (judge._animSprite) {
                  try { judge._animSprite.stop(); self.gamefield.removeChild(judge._animSprite); judge._animSprite.destroy(); } catch {}
                  judge._animSprite = null;
               }
               const anim = new PIXI.AnimatedSprite(animFrames);
               anim.anchor.set(0.5);
               anim.scale.set(judge.scale.x, judge.scale.y);
               anim.x = judge.x; anim.y = judge.y;
               anim.zIndex = judge.zIndex;
               anim.eventMode = "none";
               anim.cullable = false;
               anim.animationSpeed = (window.game?.skinConfig?.animationFramerate || 60) / 60;
               anim.loop = false;
               anim.gotoAndPlay(0);
               anim.onComplete = () => { try { anim.gotoAndStop(animFrames.length - 1); } catch {} };
               self.gamefield.addChild(anim);
               judge._animSprite = anim;
               // Hide the static sprite — the AnimatedSprite renders on top
               judge.visible = false;
            } catch (e) {
               // Fall back to static if AnimatedSprite creation fails
               judge.texture = tex;
               if (tex === PIXI.Texture.WHITE) judge.tint = judgementColor(points);
               else judge.tint = 0xffffff;
            }
         } else {
            judge.texture = tex;
            if (tex === PIXI.Texture.WHITE) judge.tint = judgementColor(points);
            else judge.tint = 0xffffff;
         }
         // ensure sprite judgements respect hideGreat as optional — but keep visible for now
         // if (this.hideGreat && points === 300) judge.visible = false;
       } else {
         // text path — always set text so judgements are visible even with hideGreat
         judge.text = judgementText(points);
         judge.tint = judgementColor(points);
      }
      // T10: hit burst on non-miss
      if (points !== 0) {
         try {
            this.createHitBurst(judge.basex, judge.basey, time);
         } catch (e) {}
      }
      this.updateJudgement(judge, time);
   };

   this.updateJudgement = function (
      judge,
      time, // set transform of judgement text
   ) {
      if (judge.points < 0 && time >= judge.finalTime) {
         // Skip miss check on a scrub frame (audio position jumped > 200ms):
         // the user hasn't had a chance to play these hits. The next frame uses
         // the new time and the scrub flag resets, so subsequent misses are real.
         // This is the scrub-only guard — there is NO per-frame miss cap, so a
         // real frame can fire multiple misses (a human cannot miss 10 hits in
         // 33ms, but if they somehow do, each miss counts). The cap caused the
         // original "burst-miss on first tap" bug and is NOT restored.
         if (self._scrubFrame) return;
         // miss — fire immediately (no cap)
         this.scoreOverlay.hit(judge.defaultScore, 300, time, { lastInCombo: !!judge.lastInCombo });
         this.invokeJudgement(judge, judge.defaultScore, time);
         return;
      }
      if (!judge.visible) return;

      let t = time - judge.t0;

      // T9: judgement pop scale curve: 0.8 -> 1.1 at 100ms -> 1.0 at 150ms
      let popScale;
      if (t < 100) popScale = 0.8 + 0.3 * (t / 100);
      else if (t < 150) popScale = 1.1 - 0.1 * ((t - 100) / 50);
      else popScale = 1.0;
      let bx =
         judge.baseScaleX != null
            ? judge.baseScaleX
            : 0.85 * this.hitSpriteScale;
      let by =
         judge.baseScaleY != null
            ? judge.baseScaleY
            : 0.85 * this.hitSpriteScale;
      if (judge.useSprites) {
         // sprite uses uniform scale, preserve aspect
         judge.scale.set(bx * popScale, by * popScale);
      } else {
         // text: scale X/Y differ, apply pop uniformly
         judge.scale.set(bx * popScale, by * popScale);
      }

      if (judge.points == 0) {
         // miss
         if (t > 800) {
            judge.visible = false;
            return;
         }
         judge.alpha = t < 100 ? t / 100 : t < 600 ? 1 : 1 - (t - 600) / 200;
         judge.y =
            judge.basey + 100 * Math.pow(t / 800, 5) * this.hitSpriteScale;
         judge.rotation = 0.7 * Math.pow(t / 800, 5);
      } // meh, good, great
      else {
         if (t > 500) {
            judge.visible = false;
            return;
         }
         judge.alpha = t < 100 ? t / 100 : 1 - (t - 100) / 400;
         if (!judge.useSprites)
            judge.letterSpacing = 70 * (Math.pow(t / 1800 - 1, 5) + 1);
      }
   };

   // T10: hit burst sprite (scale 1.0 -> 1.5, alpha 1 -> 0 over 200ms) — pooled
   this.createHitBurst = function (x, y, time) {
      if (!window.Skin || !window.Skin?.["hitburst.png"]) return;
      const tex = window.Skin?.["hitburst.png"] || PIXI.Texture.WHITE;
      let arr = self._spritePool.get(tex);
      let s = arr && arr.length ? arr.pop() : new PIXI.Sprite(tex);
      if (s.texture !== tex) s.texture = tex;
      s.anchor.set(0.5);
      s.x = x;
      s.y = y;
      s.scale.set(this.hitSpriteScale);
      s.alpha = 1;
      s.visible = true;
      s._burstT0 = time;
      s.zIndex = 4.5;
      s.eventMode = "none";
      s.cullable = false;
      s._pooledTex = tex;
      self.gamefield.addChild(s);
      self._hitBursts.push(s);
   };
   // T11: combo color flash (scale 1.0 -> 2.0, alpha 0.6 -> 0 over 100ms)
   this.createComboFlash = function (x, y, color, time) {
      var g;
      try {
         g = new PIXI.Graphics();
         if (typeof g.circle === "function") {
            g.circle(0, 0, self.circleRadius * 0.45);
            g.fill({ color: color, alpha: 1 });
         } else {
            g.beginFill(color);
            g.drawCircle(0, 0, self.circleRadius * 0.45);
            g.endFill();
         }
      } catch (e) {
         g = new PIXI.Sprite(
            window.Skin?.["hitcircleoverlay.png"] || PIXI.Texture.WHITE,
         );
         g.anchor.set(0.5);
         g.tint = color;
         g.scale.set(self.hitSpriteScale * 0.45);
      }
      g.x = x;
      g.y = y;
      g.alpha = 0.6;
      if (!(g instanceof PIXI.Sprite)) g.scale.set(1);
      g._flashT0 = time;
      g.zIndex = 4.6;
      g.eventMode = "none";
      g.cullable = false;
      self.gamefield.addChild(g);
      self._comboFlashes.push(g);
   };
   this.updateEffects = function (time) {
      for (let i = self._hitBursts.length - 1; i >= 0; i--) {
         let s = self._hitBursts[i];
         let t = time - s._burstT0;
         if (t >= 200) {
            self.gamefield.removeChild(s);
            self._releaseToPool(s);
            self._hitBursts.splice(i, 1);
         } else {
            let p = t / 200;
            s.scale.set(self.hitSpriteScale * (1 + 0.5 * p));
            s.alpha = 1 - p;
         }
      }
      for (let i = self._comboFlashes.length - 1; i >= 0; i--) {
         let g = self._comboFlashes[i];
         let t = time - g._flashT0;
         if (t >= 100) {
            self.gamefield.removeChild(g);
            g.destroy();
            self._comboFlashes.splice(i, 1);
         } else {
            let p = t / 100;
            g.scale.set(1 + p);
            g.alpha = 0.6 * (1 - p);
         }
      }
   };

   this.createBackground = function () {
      async function loadBackground(uri) {
         const gen = self._generation;
         glog("playback", "loadBackground", uri.slice(0, 60));
          let bgTexture = null;
         const isBlob = uri && uri.startsWith("blob:");
         const isVideo = uri && /\.(mp4|webm|mov|avi|mkv)$/i.test(uri);
         // Video backgrounds: show placeholder and offer download option; don't auto-load video
         // to save bandwidth. The difficulty select can trigger video download.
         if (isVideo && !uri.startsWith("blob:")) {
            glog("playback", "video background detected, using default with download option", uri);
            // Use default background but mark that video is available
            if (window.game) window.game.videoBackgroundAvailable = uri;
            throw new Error("video background deferred to user choice");
         }
         // Accept every reasonable image extension via Assets.load (which handles blob:/data:/http URLs).
         // For explicitly-blob URLs we resolve via Image + decode + Texture.from() so the GPU source is
         // captured (Pixi v8 Texture.from does NOT fetch; the underlying Image element does).
         try {
            if (isBlob) {
               // Handle both image and video blobs
               if (isVideo) {
                  // Video blob: create video element
                  const video = document.createElement("video");
                  video.crossOrigin = "anonymous";
                  video.src = uri;
                  video.muted = true;
                  video.loop = true;
                  await new Promise((res, rej) => {
                     video.onloadeddata = res;
                     video.onerror = rej;
                     setTimeout(rej, 5000);
                  });
                  bgTexture = PIXI.Texture.from(video);
                  // Store video element for playback control
                  if (window.game) window.game.backgroundVideo = video;
               } else {
                  const img = new Image();
                  img.crossOrigin = "anonymous";
                  img.src = uri;
                  await img.decode().catch(
                     () =>
                        new Promise((res, rej) => {
                           img.onload = res;
                           img.onerror = rej;
                        }),
                  );
                  bgTexture = PIXI.Texture.from(img);
               }
            } else {
               bgTexture = await PIXI.Assets.load(uri);
            }
            try {
               if (
                  window.app &&
                  window.app.renderer &&
                  window.app.renderer.prepare &&
                  window.app.renderer.prepare.upload &&
                  bgTexture
               )
                  await window.app.renderer.prepare.upload(bgTexture);
            } catch {}
         } catch (e) {
            gdebug("playback", "bg texture load failed", (e && e.message) || e);
            bgTexture = null;
         }
         const isValid = (t) =>
            !!(t && (t.valid || (t.source && t.source.valid)));
         if (!isValid(bgTexture)) {
            gwarn("playback", "bgTexture invalid, using default background");
            try {
               bgTexture = await PIXI.Assets.load("/img/defaultbg.jpg");
            } catch (e2) {
               gerror("playback", "default background also failed", e2);
               bgTexture = PIXI.Texture.WHITE;
            }
            if (isBlob) {
               try {
                  URL.revokeObjectURL(uri);
               } catch {}
            }
         }
         let sprite = new PIXI.Sprite(bgTexture);
         if (self.game.backgroundBlurRate > 0.0001) {
            let width =
               bgTexture.source?.width || bgTexture.width || window.innerWidth;
            let height =
               bgTexture.source?.height ||
               bgTexture.height ||
               window.innerHeight;
            sprite.anchor.set(0.5);
            sprite.x = width / 2;
            sprite.y = height / 2;
            let blurstrength =
               self.game.backgroundBlurRate * Math.min(width, height);
            let t = Math.max(
               Math.min(width, height),
               Math.max(10, blurstrength) * 3,
            );
            sprite.scale.set(t / (t - 2 * Math.max(10, blurstrength)));
            let blurFilter = new PIXI.BlurFilter({
               strength: blurstrength,
               quality: 4,
            });
            blurFilter.autoFit = false;
            sprite.filters = [blurFilter];
         }
         // Pixi v8: render with options object { container, target }
         let w = bgTexture.source?.width || bgTexture.width || 1920,
            h = bgTexture.source?.height || bgTexture.height || 1080;
         let texture = PIXI.RenderTexture.create({
            width: w,
            height: h,
            resolution: 1,
         });
         try {
            await window.app.renderer.render({
               container: sprite,
               target: texture,
            });
         } catch (e) {
            try {
               window.app.renderer.render(sprite, texture);
            } catch (e2) {
               gerror("playback", "background render failed", e2);
               texture = bgTexture;
               sprite = new PIXI.Sprite(texture);
            }
         }
         // Revoke the blob URL AFTER GPU upload + render. Do not call Assets.unload on a blob
         // we never registered with Assets (would log a noisy "not found in Cache" warning).
         if (isBlob) {
            try {
               URL.revokeObjectURL(uri);
            } catch {}
         }
         // stale check: if retry/destroy happened during async load, discard result
         if (gen !== self._generation) return;
         // destroy previous background RenderTexture to prevent GPU leak
         if (self.background) {
            try {
               const oldTex = self.background.texture;
               if (
                  oldTex &&
                  oldTex !== PIXI.Texture.WHITE &&
                  oldTex !== bgTexture
               ) {
                  try {
                     oldTex.destroy(true);
                  } catch {}
               }
               self.game.stage.removeChild(self.background);
               self.background.destroy({ children: true, texture: false });
            } catch {}
         }
         self.background = new PIXI.Sprite(texture);
         self.background.anchor.set(0.5);
         self.background.x = window.innerWidth / 2;
         self.background.y = window.innerHeight / 2;
         self.background.scale.set(
            Math.max(
               window.innerWidth / self.background.texture.width,
               window.innerHeight / self.background.texture.height,
            ),
         );
         self.background.alpha = 1; // visible; tint in updateBackground handles dimming
         self.game.stage.addChildAt(self.background, 0);
         glog("playback", "background added");
      }
      if (self.track.events.length != 0) {
         // Use first non-video background image; skip Video events entirely for performance
         let bgFile = null;
         for (let ev of self.track.events) {
            if (!ev || ev.length < 3) continue;
            const type = (ev[0] || "").trim();
            const fn = (ev[2] || "").trim().replace(/^"|"$/g, "");
            if (!fn) continue;
            const lower = fn.toLowerCase();
            if (type.toLowerCase() === "video") continue; // scrap video — no impact
            if (
               lower.endsWith(".jpg") ||
               lower.endsWith(".jpeg") ||
               lower.endsWith(".png") ||
               lower.endsWith(".bmp") ||
               lower.endsWith(".gif") ||
               lower.endsWith(".webp") ||
               lower.endsWith(".avif")
            ) {
               bgFile = fn;
               break;
            }
         }
         if (!bgFile && self.track.events[0] && self.track.events[0][2]) {
            const f = self.track.events[0][2].replace(/^"|"$/g, "");
            if (
               !f.toLowerCase().endsWith(".mp4") &&
               !f.toLowerCase().endsWith(".avi")
            )
               bgFile = f;
         }
         glog("playback", "background file", bgFile);
         if (bgFile) {
            const entry = osu.zip.getChildByName(bgFile);
            if (entry) {
               const ext = (bgFile.split(".").pop() || "").toLowerCase();
               const mime =
                  ext === "png"
                     ? "image/png"
                     : ext === "bmp"
                       ? "image/bmp"
                       : ext === "gif"
                         ? "image/gif"
                         : ext === "webp"
                           ? "image/webp"
                           : ext === "avif"
                             ? "image/avif"
                             : "image/jpeg";
               entry.getBlob(mime, function (blob) {
                  const uri = URL.createObjectURL(blob);
                  loadBackground(uri);
               });
            } else {
               gwarn("playback", "bg file not found, using default", bgFile);
               loadBackground("img/defaultbg.jpg");
            }
         } else {
            loadBackground("img/defaultbg.jpg");
         }
      } else {
         loadBackground("img/defaultbg.jpg");
      }
   };
   self.createBackground();

   // load combo colors
   function convertcolor(color) {
      return (+color[0] << 16) | (+color[1] << 8) | (+color[2] << 0);
   }
   var combos = [];
   if (
      window.game &&
      window.game.skinComboColors &&
      window.game.skinComboColors.length > 0
   ) {
      // Use skin.ini combo colors
      combos = window.game.skinComboColors.slice();
   } else {
      for (var i = 0; i < track.colors.length; i++) {
         combos.push(convertcolor(track.colors[i]));
      }
   }
   var SliderTrackOverride;
   var SliderBorder;
   // leave them undefined if they're undefined in the beatmap
   if (window.game && window.game.skinSliderTrackOverride != null)
      SliderTrackOverride = window.game.skinSliderTrackOverride;
   else if (track.colors.SliderTrackOverride)
      SliderTrackOverride = convertcolor(track.colors.SliderTrackOverride);
   if (window.game && window.game.skinSliderBorder != null)
      SliderBorder = window.game.skinSliderBorder;
   else if (track.colors.SliderBorder)
      SliderBorder = convertcolor(track.colors.SliderBorder);
   glog(
      "playback",
      "combos",
      combos.length,
      combos.map((c) => "#" + c.toString(16).padStart(6, "0")),
      "trackOverride",
      SliderTrackOverride,
      "border",
      SliderBorder,
      "hits",
      self.hits.length,
   );

   self.game.stage.addChild(this.gamefield);
   // v8: zIndex layering — gamefield=0, HUD=10..60, cursor=999
   this.gamefield.zIndex = 0;
   // HUD overlays are always on-screen — skip culler from recursing into them
   this.scoreOverlay.cullableChildren = false;
   this.scoreOverlay.zIndex = 10;
   this.errorMeter.cullableChildren = false;
   this.errorMeter.zIndex = 20;
   this.progressOverlay.cullableChildren = false;
   this.progressOverlay.zIndex = 30;
   this.breakOverlay.cullableChildren = false;
   this.breakOverlay.zIndex = 40;
   this.volumeMenu.cullableChildren = false;
   this.volumeMenu.zIndex = 50;
   this.loadingMenu.cullableChildren = false;
   this.loadingMenu.zIndex = 60;
   self.game.stage.addChild(this.scoreOverlay);
   self.game.stage.addChild(this.errorMeter);
   self.game.stage.addChild(this.progressOverlay);
   self.game.stage.addChild(this.breakOverlay);
   self.game.stage.addChild(this.volumeMenu);
   self.game.stage.addChild(this.loadingMenu);

   // Flashlight (FL) overlay — full-screen dark Graphics with a transparent circle
   // hole at the cursor position. zIndex 5 = above gamefield (0), below HUD (10).
   // Only created when the FL mod is active (game.flashlight).
   this.flOverlay = null;
   this.flSliderDim = null;
   this.flLastCursorX = -9999;
   this.flLastCursorY = -9999;
   this.flLastRadius = -1;
   this._flFollowingSlider = false;
   this._flDimAlpha = 0;
   // Sync FL settings from the current ModRegistry instance. Used by init and
   // also exposed as a public refresh() so toggling FL settings during play
   // (e.g. via the in-game mod panel) updates the overlay without restarting.
   this._readFlSettings = function () {
      const flMod = window.ModRegistry ? window.ModRegistry.get("FL") : null;
      const s = flMod ? flMod.settings : {};
      this._flSettings = {
         sizeCombo0: s.sizeCombo0 || 400,
         sizeCombo100: s.sizeCombo100 || 300,
         sizeCombo200: s.sizeCombo200 || 250,
         sliderDim: s.sliderDim != null ? s.sliderDim : 0.3,
      };
      // force next frame to redraw with the new radius
      this.flLastCursorX = -9999;
      this.flLastCursorY = -9999;
      this.flLastRadius = -1;
   };
   this.refreshFlashlight = function () {
      this._readFlSettings();
   };

   this.initFlashlight = function () {
      if (!game.flashlight || this.flOverlay) return;
      this._readFlSettings();
      // main overlay: black rect with a circle hole
      this.flOverlay = new PIXI.Graphics();
      this.flOverlay.eventMode = "none";
      this.flOverlay.cullable = false;
      this.flOverlay.zIndex = 5;
      self.game.stage.addChild(this.flOverlay);
      // slider dim: a second full-screen black rect that fades in during slider following
      this.flSliderDim = new PIXI.Graphics();
      this.flSliderDim.eventMode = "none";
      this.flSliderDim.cullable = false;
      this.flSliderDim.zIndex = 5.5;
      this.flSliderDim.alpha = 0;
      self.game.stage.addChild(this.flSliderDim);
      glog("playback", "Flashlight overlay initialized");
   };
   this.initFlashlight();

   // Compute the FL circle radius from the current combo (lazer FlashlightSize curve).
   this.flRadiusForCombo = function (combo) {
      const s = this._flSettings;
      if (!s) return 300;
      if (combo >= 200) return s.sizeCombo200;
      if (combo >= 100)
         return (
            s.sizeCombo100 +
            ((s.sizeCombo200 - s.sizeCombo100) * (combo - 100)) / 100
         );
      if (combo > 0)
         return s.sizeCombo0 + ((s.sizeCombo100 - s.sizeCombo0) * combo) / 100;
      return s.sizeCombo0;
   };

   // Redraw the FL overlay hole at the cursor's screen position.
   // Called from the render loop; dirty-flagged on cursor movement >1px or radius change.
   this.updateFlashlight = function (time) {
      if (!this.flOverlay) return;
      // cursor screen position (same transform as the cursor sprite in launchgame.js)
      const cx = (game.mouseX / 512) * gfx.width + gfx.xoffset;
      const cy = (game.mouseY / 384) * gfx.height + gfx.yoffset;
      const combo = this.scoreOverlay ? this.scoreOverlay.combo : 0;
      // scale the osu-pixel radius to screen pixels
      const radius = this.flRadiusForCombo(combo) * (gfx.width / 512);
      const dx = cx - this.flLastCursorX;
      const dy = cy - this.flLastCursorY;
      const moved = dx * dx + dy * dy > 1; // >1px
      const radiusChanged = Math.abs(radius - this.flLastRadius) > 0.5;
      if (moved || radiusChanged) {
         this.flLastCursorX = cx;
         this.flLastCursorY = cy;
         this.flLastRadius = radius;
         const g = this.flOverlay;
         g.clear();
         // full-screen black rect
         g.rect(0, 0, window.innerWidth, window.innerHeight);
         g.fill({ color: 0x000000, alpha: 1 });
         // punch a transparent circle hole at the cursor
         g.circle(cx, cy, radius);
         g.cut();
      }
      // slider dim: fade in while following a slider, fade out otherwise
      const targetDim = this._flFollowingSlider
         ? this._flSettings.sliderDim
         : 0;
      // frame-rate-independent lerp toward target
      const dt = window.currentFrameInterval || 16.67;
      const k = 1 - Math.exp(-dt / 100); // ~100ms time constant
      this._flDimAlpha += (targetDim - this._flDimAlpha) * k;
      if (this.flSliderDim) {
         // only redraw the dim rect if alpha changed meaningfully
         if (Math.abs(this.flSliderDim.alpha - this._flDimAlpha) > 0.01) {
            this.flSliderDim.clear();
            this.flSliderDim.rect(0, 0, window.innerWidth, window.innerHeight);
            this.flSliderDim.fill({ color: 0x000000, alpha: this._flDimAlpha });
            this.flSliderDim.alpha = 1;
         }
      }
   };
   // Track whether the cursor is currently following a slider (set in updateSlider)
   this._flSetFollowing = function (isfollowing) {
      this._flFollowingSlider = isfollowing;
   };

   // Adaptive Speed: adjust the audio playback rate based on recent accuracy.
   // On a streak of greats, increase toward maxRate; on misses, decrease toward 1.0.
   this.updateAdaptiveSpeed = function (time) {
      const asMod = window.ModRegistry ? window.ModRegistry.get("AS") : null;
      const s = asMod ? asMod.settings : {};
      const maxRate = s.maxRate || 1.05;
      const step = s.adjustStep || 0.01;
      const streakReq = s.streakRequired || 5;
      // sample recent judgements from the score overlay
      const j = this.scoreOverlay.judgecnt;
      const recent = this._asRecentJudgements;
      // track the last total great count to detect new greats
      if (this._asLastGreats === undefined) this._asLastGreats = j.great;
      const newGreats = j.great - this._asLastGreats;
      const newMisses = j.miss - (this._asLastMisses || 0);
      this._asLastGreats = j.great;
      this._asLastMisses = j.miss;
      if (newGreats > 0) {
         for (let i = 0; i < newGreats; i++) recent.push(300);
         if (recent.length > streakReq * 2)
            recent.splice(0, recent.length - streakReq * 2);
         // if the last streakReq are all greats, increase rate
         if (
            recent.length >= streakReq &&
            recent.slice(-streakReq).every((r) => r === 300)
         ) {
            this._asCurrentRate = Math.min(maxRate, this._asCurrentRate + step);
         }
      }
      if (newMisses > 0) {
         for (let i = 0; i < newMisses; i++) recent.push(0);
         // any miss → decrease toward 1.0
         this._asCurrentRate = Math.max(1.0, this._asCurrentRate - step * 2);
      }
      // apply the rate (multiply on top of DT/HT if active)
      const baseRate = this.playbackRate;
      const targetRate = baseRate * this._asCurrentRate;
      if (this.osu.audio.playbackRate !== targetRate) {
         this.osu.audio.playbackRate = targetRate;
         try {
            if (this.osu.audio.source)
               this.osu.audio.source.playbackRate.value = targetRate;
         } catch (e) {}
      }
      // scale approach time so objects approach at the new speed
      this._asApproachScale = 1 / this._asCurrentRate;
   };

   // Fun-mod geometry transforms applied per-frame to upcoming hit objects.
   // Wobble: sine-wave displacement. Depth: scale by cursor distance.
   // Transform: rotate/translate/scale around playfield center.
   // Traceable: hide objects until cursor is near. NoScope: hide cursor (handled in launchgame).
   // Bubbles: spawn bubble particles on hits (handled in hitSuccess).
   this._applyFunModTransforms = function (time) {
      if (!self.upcomingHits.length) return;
      const g = this.game;
      const cx = 256,
         cy = 192; // playfield center in osu! pixels
      const mx = g.mouseX,
         my = g.mouseY;
      // Wobble
      if (g.wobble) {
         const wm = window.ModRegistry ? window.ModRegistry.get("WO") : null;
         const s = wm ? wm.settings : {};
         const strength = s.strength || 8;
         const freq = s.frequency || 0.005;
         const dx = Math.sin(time * freq) * strength;
         const dy = Math.cos(time * freq * 1.3) * strength;
         for (const hit of self.upcomingHits) {
            if (hit.type === "spinner") continue;
            if (hit.base) {
               hit.base.x = hit.x + dx;
               hit.base.y = hit.y + dy;
            }
         }
      }
      // Depth
      if (g.depth) {
         const dm = window.ModRegistry ? window.ModRegistry.get("DP") : null;
         const s = dm ? dm.settings : {};
         const scaleNear = s.scaleNear || 1.2,
            scaleFar = s.scaleFar || 0.6,
            maxDist = s.maxDist || 400;
         for (const hit of self.upcomingHits) {
            if (hit.type === "spinner") continue;
            const dist = Math.hypot(mx - hit.x, my - hit.y);
            const t = Math.min(1, dist / maxDist);
            const scale = scaleNear + (scaleFar - scaleNear) * t;
            if (hit.base) hit.base.scale.set(this.hitSpriteScale * 0.5 * scale);
         }
      }
      // Transform (rotate/translate/scale around playfield center)
      if (g.transform) {
         const tm = window.ModRegistry ? window.ModRegistry.get("TF") : null;
         const s = tm ? tm.settings : {};
         const rot = ((s.rotate || 0) * Math.PI) / 180;
         const tx = s.translateX || 0,
            ty = s.translateY || 0,
            sc = s.scale || 1.0;
         const cosR = Math.cos(rot),
            sinR = Math.sin(rot);
         for (const hit of self.upcomingHits) {
            if (hit.type === "spinner") continue;
            const dx = (hit.x - cx) * sc,
               dy = (hit.y - cy) * sc;
            const nx = cx + dx * cosR - dy * sinR + tx;
            const ny = cy + dx * sinR + dy * cosR + ty;
            if (hit.base) {
               hit.base.x = nx;
               hit.base.y = ny;
            }
         }
      }
      // Traceable: hide objects until cursor is within revealRadius
      if (g.traceable) {
         const trm = window.ModRegistry ? window.ModRegistry.get("TR") : null;
         const s = trm ? trm.settings : {};
         const revealR = s.revealRadius || 120;
         const revealR2 = revealR * revealR;
         for (const hit of self.upcomingHits) {
            if (hit.type === "spinner") continue;
            const dist2 =
               (mx - hit.x) * (mx - hit.x) + (my - hit.y) * (my - hit.y);
            const reveal = dist2 < revealR2;
            const alpha = reveal ? 1 : 0;
            if (hit.base) hit.base.alpha = alpha;
            if (hit.circle) hit.circle.alpha = alpha;
            if (hit.approach) hit.approach.alpha = alpha;
         }
      }
   };

   // Bubbles: spawn a bubble sprite at the hit position on each successful hit.
   // Pooled to avoid per-hit allocation.
   this._bubblePool = [];
   this._bubbles = [];
   this.spawnBubble = function (x, y, time) {
      if (!this.game.bubbles) return;
      const bm = window.ModRegistry ? window.ModRegistry.get("BU") : null;
      const lifetime = (bm && bm.settings.lifetime) || 800;
      let b = this._bubblePool.length
         ? this._bubblePool.pop()
         : new PIXI.Graphics();
      b.clear();
      b.circle(0, 0, this.circleRadius * 0.3);
      b.fill({ color: 0x88ccff, alpha: 0.6 });
      b.x = x;
      b.y = y;
      b.alpha = 1;
      b.visible = true;
      b._bubbleT0 = time;
      b._bubbleLifetime = lifetime;
      b.zIndex = 6;
      b.eventMode = "none";
      b.cullable = false;
      this.gamefield.addChild(b);
      this._bubbles.push(b);
   };
   this.updateBubbles = function (time) {
      for (let i = this._bubbles.length - 1; i >= 0; i--) {
         let b = this._bubbles[i];
         let t = time - b._bubbleT0;
         if (t >= b._bubbleLifetime) {
            this.gamefield.removeChild(b);
            if (this._bubblePool.length < 32) this._bubblePool.push(b);
            else b.destroy();
            this._bubbles.splice(i, 1);
         } else {
            let p = t / b._bubbleLifetime;
            b.y -= (0.5 * (window.currentFrameInterval || 16.67)) / 16.67; // float up
            b.alpha = 1 - p;
            b.scale.set(1 + p * 0.5);
         }
      }
   };

   // creating hit objects
   this.createHitCircle = function (hit) {
      function newHitSprite(
         spritename,
         depth,
         scalemul = 1,
         anchorx = 0.5,
         anchory = 0.5,
      ) {
         // Core hitcircle may be stored as disc.png; alias both ways.
         let tex = window.Skin?.[spritename];
         if (!tex && spritename === "hitcircle.png")
            tex = window.Skin?.["disc.png"];
         if (!tex && spritename === "disc.png")
            tex = window.Skin?.["hitcircle.png"];
         if (!tex) tex = PIXI.Texture.WHITE;
         let arr = self._spritePool.get(tex);
         let sprite = arr && arr.length ? arr.pop() : new PIXI.Sprite(tex);
         if (sprite.texture !== tex || !sprite.texture?.valid)
            sprite.texture = tex;
         // reset every property a hit sprite can carry so a pooled sprite is
         // indistinguishable from a fresh one (safe by construction)
         sprite.initialscale = self.hitSpriteScale * scalemul;
         sprite.scale.x = sprite.scale.y = sprite.initialscale;
         sprite.anchor.x = anchorx;
         sprite.anchor.y = anchory;
         sprite.x = hit.x;
         sprite.y = hit.y;
         sprite.rotation = 0;
         sprite.zIndex = depth;
         sprite.alpha = 0;
         sprite.visible = true;
         sprite.tint = 0xffffff;
         sprite.blendMode = "normal";
         sprite.eventMode = "none";
         sprite.cullable = false;
         sprite._pooledTex = tex;
         hit.objects.push(sprite);
         return sprite;
      }
      let index = hit.index + 1;
      let basedep = 4.9999 - 0.0001 * hit.hitIndex;

      hit.base = newHitSprite("disc.png", basedep, 1.09);
      hit.base.tint = combos[hit.combo % combos.length];

      hit.circle = newHitSprite("hitcircleoverlay.png", basedep, 1.09);
      hit.glow = newHitSprite("ring-glow.png", basedep + 2, 1.0);
      hit.glow.tint = combos[hit.combo % combos.length];
      hit.glow.blendMode = "add";
      hit.burst = newHitSprite("hitburst.png", 8.00005 + 0.0001 * hit.hitIndex);
      hit.burst.visible = false;

      hit.approach = newHitSprite(
         "approachcircle.png",
         8 + 0.0001 * hit.hitIndex,
      );
      if (
         window.game &&
         window.game.skinConfig &&
         window.game.skinConfig.approachCircle != null
      ) {
         hit.approach.tint = window.game.skinConfig.approachCircle;
      } else {
         hit.approach.tint = combos[hit.combo % combos.length];
      }

      hit.judgements.push(
         this.createJudgement(hit.x, hit.y, hit.time + this.MehTime),
      );
      hit.judgements[hit.judgements.length - 1].lastInCombo = !!hit.lastInCombo;

      // create combo number — respect skin.ini HitCirclePrefix/ScorePrefix, gated to valid
      function hitNumberKey(digit) {
         let rawPrefix =
            (window.game &&
               window.game.skinConfig &&
               window.game.skinConfig.hitCirclePrefix) ||
            "score";
         // Normalize: path-style prefixes (e.g. "Assets/default/default") reduce to
         // their basename ("default"); digits live at "default-<d>.png" in the loader.
         const prefixBase = rawPrefix.split("/").pop() || rawPrefix;
         let cand;
         if (prefixBase === "default") cand = digit + ".png";
         else cand = prefixBase + "-" + digit + ".png";
         if (window.Skin && window.Skin?.[cand]) return cand;
         // fallback chain: score-, default-, then bare digit variants
         if (window.Skin && window.Skin?.["score-" + digit + ".png"])
            return "score-" + digit + ".png";
         if (window.Skin && window.Skin?.["default-" + digit + ".png"])
            return "default-" + digit + ".png";
         if (window.Skin && window.Skin?.[digit + ".png"])
            return digit + ".png";
         // last fallback: any available, even if not valid (will be white)
         return cand;
      }
      hit.numbers = [];
      // Multi-digit combo number rendering (supports 1-4+ digits, combos >99).
      // Leftmost digit anchors x=1 (right-aligned to next), rightmost x=0 (left-aligned),
      // middle digits x=0.5 (centered). HitCircleOverlap applied between each pair.
      const digits = index.toString().split("").map(Number);
      const digitCount = digits.length;
      for (let di = 0; di < digitCount; di++) {
         const isLeftmost = di === digitCount - 1; // most-significant digit (left)
         const isRightmost = di === 0; // least-significant digit (right)
         const anchorX = 0.5; // always center the number inside the circle
         // Normalize number scale to the disc texture size so different skins
         // don't produce tiny or huge numbers. The osu! default disc is 128px
         // and default number is ~64px, so the ratio is 0.5. We compute the
         // actual ratio from the loaded textures and use that instead of a
         // fixed 0.4/0.35.
         var numTexKey = hitNumberKey(digits[di]);
         var scalemul = digitCount === 1 ? 0.32 : 0.28;
         hit.numbers.push(
            newHitSprite(
               numTexKey,
               basedep,
               scalemul,
               anchorX,
               0.5, // centered vertically (was 0.47 — off-center)
            ),
         );
      }
       // handle HitCircleOverlap from skin.ini (overlap in pixels) — apply between each pair.
       // Lazer parity (T14 D6): lazer's LegacySpriteText uses Spacing = -overlap
       // (net 1.0·overlap per pair). The previous * 0.3 per side (net 0.6) was a
       // misimplementation — 40% less spaced than lazer. Now * 0.5 per side.
       const overlap =
          (window.game &&
             window.game.skinConfig &&
             window.game.skinConfig.hitCircleOverlap) ||
          0;
       if (overlap && digitCount > 1) {
          for (let di = 0; di < digitCount - 1; di++) {
             hit.numbers[di].x += overlap * 0.5; // right digit shifts right
             hit.numbers[di + 1].x -= overlap * 0.5; // left digit shifts left
          }
       }
      // Multi-digit combo numbers supported (1-9999+)
   };

   this.createSlider = function (hit) {
      hit.lastrep = 0; // for current-repeat counting
      hit.nexttick = 0; // for tick hit counting
      hit.sliderJudge = new SliderJudge(hit); // lazer accumulator

      // create slider body — Graphics-based SliderMesh is now the primary (no GL shader)
      let body;
      try {
         if (!hit.curve || !hit.curve.curve || hit.curve.curve.length < 2)
            throw new Error("invalid curve");
         body = new SliderMesh(
            hit.curve,
            this.circleRadius,
            hit.combo % combos.length,
         );
         body.visible = true;
         body.eventMode = "none";
         body.cullable = false;
         // ponytail: geometry check is legacy GL; Graphics always has geometry after first draw, so skip
         gdebug(
            "playback",
            "slider body created",
            hit.hitIndex,
            "combo",
            hit.combo,
            "pts",
            hit.curve.curve.length,
            "len",
            hit.pixelLength,
         );
      } catch (e) {
         // only log at debug to avoid flooding (was gerror per-slider → hundreds of logs)
         gdebug("playback", "SliderMesh fallback", e.message, hit.hitIndex);
         body = new PIXI.Graphics();
         body.visible = true;
         body.eventMode = "none";
         body.cullable = false;
         try {
            const col =
               SliderTrackOverride ??
               combos[hit.combo % combos.length] ??
               0xffffff;
            const brd = SliderBorder ?? 0xffffff;
            const pts = hit.curve?.curve || [
               { x: hit.x, y: hit.y },
               { x: hit.x + 50, y: hit.y },
            ];
            const w = this.circleRadius * 2;
            // 3-stroke: shadow (w+4 black 0.35) + border (w+6 white 0.95) + fill (w combo 0.9) — opaque on dim
            body.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++)
               body.lineTo(pts[i].x, pts[i].y);
            body.stroke({
               width: w + 4,
               color: 0x000000,
               alpha: 0.35,
               cap: "round",
               join: "round",
            });
            // border
            body.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++)
               body.lineTo(pts[i].x, pts[i].y);
            body.stroke({
               width: w + 6,
               color: brd,
               alpha: 0.95,
               cap: "round",
               join: "round",
            });
            // inner track
            body.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++)
               body.lineTo(pts[i].x, pts[i].y);
            body.stroke({
               width: w,
               color: col,
               alpha: 0.9,
               cap: "round",
               join: "round",
            });
            glog(
               "playback",
               "fallback Graphics slider drawn with shadow/outline",
               pts.length,
               "pts",
            );
         } catch (ge) {
            gerror("playback", "fallback also failed", ge);
            body = new PIXI.Container();
         }
      }
      hit.body = body;
      body.alpha = 0;
      body.zIndex = 4.9999 - 0.0001 * hit.hitIndex;
      hit.objects.push(body);

      function newSprite(spritename, x, y, scalemul = 1) {
         const tex = window.Skin?.[spritename] || PIXI.Texture.WHITE;
         let arr = self._spritePool.get(tex);
         let sprite = arr && arr.length ? arr.pop() : new PIXI.Sprite(tex);
         if (sprite.texture !== tex || !sprite.texture?.valid)
            sprite.texture = tex;
         sprite.scale.set(self.hitSpriteScale * scalemul);
         sprite.anchor.set(0.5);
         sprite.x = x;
         sprite.y = y;
         sprite.rotation = 0;
         sprite.zIndex = 4.9999 - 0.0001 * hit.hitIndex;
         sprite.alpha = 0;
         sprite.visible = true;
         sprite.tint = 0xffffff;
         sprite.blendMode = "normal";
         sprite.eventMode = "none";
         sprite.cullable = false;
         sprite._pooledTex = tex;
         hit.objects.push(sprite);
         return sprite;
      }

      // add slider ticks
      hit.ticks = [];
      let tickDuration =
         hit.timing.trueMillisecondsPerBeat /
         this.track.difficulty.SliderTickRate;
      let nticks = Math.floor(hit.sliderTimeTotal / tickDuration) + 1;
      for (let i = 0; i < nticks; ++i) {
         let t = hit.time + i * tickDuration;
         // Question: are ticks offset to the slider start or its timing point?
         let pos = repeatclamp((i * tickDuration) / hit.sliderTime);
         if (Math.min(pos, 1 - pos) * hit.sliderTime <= 10)
            // omit ticks near slider end (within 10ms)
            continue;
         let at = hit.curve.pointAt(pos);
         hit.ticks.push(newSprite("sliderscorepoint.png", at.x, at.y));
         hit.ticks[hit.ticks.length - 1].appeartime = t - 2 * tickDuration;
         hit.ticks[hit.ticks.length - 1].time = t;
         hit.ticks[hit.ticks.length - 1].result = false;
      }

      // slider end circle (skinnable via sliderendcircle.png)
      if (window.Skin?.["sliderendcircle.png"]) {
         let end = hit.curve.curve[hit.curve.curve.length - 1];
         try {
            hit.endCircle = newSprite("sliderendcircle.png", end.x, end.y, 0.5);
            hit.endCircle.tint = combos[hit.combo % combos.length];
            if (window.Skin?.["sliderendcircleoverlay.png"]) {
               hit.endOverlay = newSprite(
                  "sliderendcircleoverlay.png",
                  end.x,
                  end.y,
                  0.5,
               );
            }
         } catch (e) {
            gdebug("playback", "sliderendcircle failed", e);
         }
      }
      // add reverse symbol
      if (hit.repeat > 1) {
         // curve points are of about-same distance, so these 2 points should be different
         let p = hit.curve.curve[hit.curve.curve.length - 1];
         let p2 = hit.curve.curve[hit.curve.curve.length - 2];
         hit.reverse = newSprite("reversearrow.png", p.x, p.y, 0.36);
         hit.reverse.rotation = Math.atan2(p2.y - p.y, p2.x - p.x);
      }
      if (hit.repeat > 2) {
         // curve points are of about-same distance, so these 2 points should be different
         let p = hit.curve.curve[0];
         let p2 = hit.curve.curve[1];
         hit.reverse_b = newSprite("reversearrow.png", p.x, p.y, 0.36);
         hit.reverse_b.rotation = Math.atan2(p2.y - p.y, p2.x - p.x);
         hit.reverse_b.visible = false; // Only visible when it's the next end to hit
      }

      // Add follow circle (above slider body)
      hit.follow = newSprite("sliderfollowcircle.png", hit.x, hit.y);
      hit.follow.visible = false;
      hit.follow.blendMode = "add";
      hit.followSize = 1; // [1,2] current follow circle size relative to hitcircle

      // Add slider ball (above follow circle)
      // Check for slider ball animation frames (sliderb0.png through sliderbN-1.png)
      var ballTex = window.Skin?.["sliderb.png"] || PIXI.Texture.WHITE;
      if (
         window.game &&
         window.game.skinConfig &&
         window.game.skinConfig.sliderBallFrames > 0
      ) {
         var frameCount = window.game.skinConfig.sliderBallFrames;
         var frameIdx = Math.floor(
            ((self.realtime || performance.now()) / 100) % frameCount,
         );
         ballTex = window.Skin?.["sliderb" + frameIdx + ".png"] || ballTex;
      }
      hit.ball = newSprite(ballTex, hit.x, hit.y, 0.5);
      hit.ball.visible = false;
      if (window.game && window.game.allowSliderBallTint) {
         try {
            hit.ball.tint = combos[hit.combo % combos.length];
         } catch (e) {}
      }
      hit._ballFrameCount =
         (window.game &&
            window.game.skinConfig &&
            window.game.skinConfig.sliderBallFrames) ||
         0;

      // A slider contains a complete hit circle at its start, so we just make use of this
      self.createHitCircle(hit);

      // SliderScorer seam (lazer): owns nested part scoring for this slider
      hit.sliderScorer = new SliderScorer(hit, {
         hitIndex: hit.hitIndex,
         score: (type, value, t, o) => self.scoreOverlay.scoreTyped(type, value, t, o),
         display: (judgeIndex, score, t) => {
            const j = hit.judgements && hit.judgements[judgeIndex];
            if (j) self.invokeJudgement(j, score, t);
         },
         tickSound: (h2, t) => self.playTicksound(h2, t),
         sound: (h2, part, t) => self.playHitsound(h2, part, t),
      });

      // For sliders, extend the first judgement's finalTime to the slider's
      // end time + MehTime so the miss check doesn't fire while the slider
      // is still active. The slider head is judged by checkClickdown; the
      // miss should only fire if the user never interacted with the slider.
      // In lazer mode, head is a normal circle, so keep original finalTime.
      if (hit.judgements[0] && !(window.FEATURES && window.FEATURES.lazerSliderJudging)) {
         hit.judgements[0].finalTime = hit.endTime + this.MehTime;
      }

      // add judgement objects at edge
      let endPoint = hit.curve.curve[hit.curve.curve.length - 1];
      for (let i = 1; i <= hit.repeat; ++i) {
         let x = i % 2 == 1 ? endPoint.x : hit.x;
         let y = i % 2 == 1 ? endPoint.y : hit.y;
         hit.judgements.push(
            this.createJudgement(x, y, hit.time + i * hit.sliderTime),
         );
      }
   };

   this.createSpinner = function (hit) {
      hit.approachTime = self.spinnerAppearTime + self.spinnerZoomInTime;
      hit.x = 512 / 2;
      hit.y = 384 / 2;
      // absolute position
      hit.rotation = 0;
      hit.rotationProgress = 0;
      hit.clicked = false;
      // Lazer spinner: clear RPM = DifficultyRange(OD, 90, 150, 225).
      // spins/sec = clearRPM / 60. No *0.7 "make it easier" cheat.
      const spinnerRpm = lazerSpinnerRpm(this.OD);
      let spinRequiredPerSec = spinnerRpm.clear / 60;
      hit.rotationRequired =
         (2 * Math.PI * spinRequiredPerSec * (hit.endTime - hit.time)) / 1000;

      function newsprite(spritename) {
         var sprite = new PIXI.Sprite(
            window.Skin?.[spritename] || PIXI.Texture.WHITE,
         );
         sprite.anchor.set(0.5);
         sprite.x = hit.x;
         sprite.y = hit.y;
         sprite.zIndex = 4.9999 - 0.0001 * (hit.hitIndex || 1);
         sprite.alpha = 0;
         sprite.eventMode = "none";
         sprite.cullable = false;
         hit.objects.push(sprite);
         return sprite;
      }
      hit.base = newsprite("spinnerbase.png");
      hit.progress = newsprite("spinnerprogress.png");
      hit.top = newsprite("spinnertop.png");
      if (this.modhidden) {
         hit.progress.visible = false;
         hit.base.visible = false;
      }

      hit.judgements.push(
         this.createJudgement(hit.x, hit.y, hit.endTime + 233),
      );
      // The slider's end judgement is the last-in-combo for the slider (lazer:
      // the slider's tail is what carries the LastInCombo flag for the combo).
      hit.judgements[hit.judgements.length - 1].lastInCombo = !!hit.lastInCombo;
   };

   // create a follow point connection between two hit objects & store it in the latter object
   // this should be called after these hit objects be initialized, but before they're added to the stage
   this.createFollowPoint = function (hitBefore, hit) {
      var x1 = hitBefore.x;
      var y1 = hitBefore.y;
      var t1 = hitBefore.time;
      if (hitBefore.type == "slider") {
         t1 += hitBefore.sliderTimeTotal;
         if (hitBefore.repeat % 2 == 1) {
            x1 = hitBefore.curve.curve[hitBefore.curve.curve.length - 1].x;
            y1 = hitBefore.curve.curve[hitBefore.curve.curve.length - 1].y;
         }
      }
      var container = new PIXI.Container();
      container.zIndex = 3;
      container.eventMode = "none";
      container.cullable = false;
      container.x1 = x1;
      container.y1 = y1;
      container.t1 = t1;
      container.dx = hit.x - x1;
      container.dy = hit.y - y1;
      container.dt = hit.time - t1;
      container.preempt = this.approachTime;
      container.hit = hit;
      hit.objects.push(container);
      hit.followPoints = container;

      const spacing = this.circleRadius * 0.7;
      const rotation = Math.atan2(container.dy, container.dx);
      const distance = Math.hypot(container.dx, container.dy);
      for (let d = spacing * 2; d < distance - 1.5 * spacing; d += spacing) {
         let fpTex = window.Skin?.["followpoint.png"] || PIXI.Texture.WHITE;
         // Check for animation frames (followpoint-0.png through followpoint-N.png) — use game time for determinism
         if (window.Skin?.["followpoint-0.png"]) {
            const followFrames = (window.game && window.game.skinConfig && window.game.skinConfig.sliderBallFrames > 0)
               ? window.game.skinConfig.sliderBallFrames : 10;
            let frameIdx = Math.floor(
               ((self.realtime || performance.now()) / 80) % followFrames,
            );
            fpTex =
               window.Skin?.["followpoint-" + frameIdx + ".png"] ||
               window.Skin?.["followpoint-0.png"] ||
               fpTex;
         }
         let p = new PIXI.Sprite(fpTex);
         p.scale.set(this.hitSpriteScale * 0.3);
         p.x = x1 + (container.dx * d) / distance;
         p.y = y1 + (container.dy * d) / distance;
         p.blendMode = "add";
         p.rotation = rotation;
         p.anchor.set(0.5);
         p.alpha = 0;
         p.eventMode = "none";
         p.cullable = false;
         p.fraction = d / distance; // store for convenience
         container.addChild(p);
      }
   };

   this.populateHit = function (hit) {
      // Creates PIXI objects for a given hit
      this.currentHitIndex += 1;
      hit.hitIndex = this.currentHitIndex;
      hit.objects = [];
      hit.judgements = [];
      hit.score = -1;
      // Lazer last-in-combo flag (D3): a hit is the last in its combo when the
      // next hit has a different combo number, or there is no next hit. Spinners
      // always end their combo. Used by scoreTyped to apply the +0.07/+0.05/+0.03
      // last-in-combo HP bonus.
      try {
         const idx = self.hits.indexOf(hit);
         if (idx >= 0) {
            const next = self.hits[idx + 1];
            hit.lastInCombo = !next || next.combo !== hit.combo || hit.type === "spinner";
         } else {
            hit.lastInCombo = true;
         }
      } catch { hit.lastInCombo = false; }
      switch (hit.type) {
         case "circle":
            self.createHitCircle(hit);
            break;
         case "slider":
            self.createSlider(hit);
            break;
         case "spinner":
            self.createSpinner(hit);
            break;
      }
      // ?bench=1: emit a small report of the freshly created objects for the test
      // page to assert against (hit-circle scale, follow-point texture, judgement-text font).
      if (
         typeof window !== "undefined" &&
         window.__benchMarkHit &&
         hit.objects &&
         hit.objects[0]
      ) {
         try {
            const arr = [];
            for (const o of hit.objects)
               arr.push({
                  x: o.x,
                  y: o.y,
                  scaleX: o.scale.x,
                  anchorX: o.anchor && o.anchor.x,
                  tint: o.tint,
                  visible: o.visible,
                  textureValid: !!(
                     o.texture &&
                     (o.texture.valid ||
                        (o.texture.source && o.texture.source.valid))
                  ),
               });
            window.__benchMarkHit({
               index: hit.index,
               type: hit.type,
               x: hit.x,
               y: hit.y,
               objects: arr,
               judgements: (hit.judgements || []).map((j) => ({
                  x: j.x,
                  y: j.y,
                  text: j.text || "",
                  fontSize: (j.style && j.style.fontSize) || null,
                  scaleX: j.scale && j.scale.x,
                  visible: j.visible,
                  textureValid: !!(
                     j.texture &&
                     (j.texture.valid ||
                        (j.texture.source && j.texture.source.valid))
                  ),
               })),
            });
         } catch (e) {}
      }
   };

   try {
      SliderMesh.prototype.initialize(
         combos,
         this.circleRadius,
         {
            dx: (2 * gfx.width) / window.innerWidth / 512,
            ox: -1 + (2 * gfx.xoffset) / window.innerWidth,
            dy: (-2 * gfx.height) / window.innerHeight / 384,
            oy: 1 - (2 * gfx.yoffset) / window.innerHeight,
         },
         SliderTrackOverride,
         SliderBorder,
      );
      glog("playback", "SliderMesh initialized");
   } catch (e) {
      gerror(
         "playback",
         "SliderMesh initialize failed — sliders will be invisible",
         e,
      );
   }
   let sliderCount = 0;
   for (let i = 0; i < this.hits.length; i++) {
      try {
         this.populateHit(this.hits[i]);
      } catch (e) {
         gerror("playback", "populateHit failed", i, e);
      }
      if (this.hits[i].type === "slider") sliderCount++;
   }
   glog(
      "playback",
      "hits populated",
      this.hits.length,
      "sliders",
      sliderCount,
      "circles",
      this.hits.length - sliderCount,
   );
   // Set drain window for HP passive drain (score overlay reads these)
   if (this.hits && this.hits.length > 0) {
      this.gamefield._drainStart = this.hits[0].time;
      this.gamefield._drainEnd = this.hits[this.hits.length - 1].time + 1000; // 1s grace after last hit
   }
   if (this.modhidden) {
      for (let i = 0; i < this.hits.length; i++) {
         if (
            this.hits[i].approach &&
            i > 0 &&
            this.hits[i - 1].type != "spinner"
         )
            this.hits[i].approach.visible = false;
      }
   }
   if (this.hideNumbers) {
      for (let i = 0; i < this.hits.length; i++) {
         if (this.hits[i].numbers) {
            for (let j = 0; j < this.hits[i].numbers.length; ++j)
               this.hits[i].numbers[j].visible = false;
         }
      }
   }
   for (let i = 0; i < this.hits.length - 1; i++) {
      if (
         this.hits[i].type != "spinner" &&
         this.hits[i + 1].type != "spinner" &&
         this.hits[i + 1].combo == this.hits[i].combo
      )
         this.createFollowPoint(this.hits[i], this.hits[i + 1]);
   }
   if (this.hideFollowPoints) {
      for (let i = 0; i < this.hits.length; i++) {
         if (this.hits[i].followPoints) {
            this.hits[i].followPoints.visible = false;
         }
      }
   }
   // pre-upload skin textures to GPU before gameplay to avoid first-hit hitches
   try {
      if (window.app?.renderer?.prepare?.upload) {
         const texKeys = Object.keys(window.Skin || {});
         const texs = [];
         for (const k of texKeys) {
            const t = window.Skin[k];
            if (t && t.valid && t !== PIXI.Texture.WHITE) texs.push(t);
         }
         if (texs.length)
            window.app.renderer.prepare.upload(texs).catch(() => {});
      }
   } catch {}

   // hit result handling
   // use separate timing for sounds, since volume may change inside a slider or spinner
   // note: time is expected time of object hit, not real time
   this.curtimingid = 0;
   this.playTicksound = function playTicksound(hit, time) {
      while (
         this.curtimingid + 1 < this.track.timingPoints.length &&
         this.track.timingPoints[this.curtimingid + 1].offset <= time
      )
         this.curtimingid++;
      while (
         this.curtimingid > 0 &&
         this.track.timingPoints[this.curtimingid].offset > time
      )
         this.curtimingid--;
      let timing = this.track.timingPoints[this.curtimingid];
      let volume =
         (self.game.masterVolume *
            self.game.effectVolume *
            (hit.hitSample.volume != null
               ? hit.hitSample.volume
               : timing.volume)) /
         100;
      let defaultSet =
         timing.sampleSet > 0 ? timing.sampleSet : self.game.sampleSet;
      try {
         self.game.sample[defaultSet].slidertick.volume = volume;
         self.game.sample[defaultSet].slidertick.play();
      } catch (e) {}
   };

   // Continuous sliderslide sound (lazer: looped while following a slider)
   this._playSliderSlide = function (hit, time) {
      let timing =
         this.track.timingPoints[this.curtimingid] ||
         this.track.timingPoints[0];
      let volume =
         (self.game.masterVolume *
            self.game.effectVolume *
            (hit.hitSample.volume != null
               ? hit.hitSample.volume
               : timing.volume)) /
         100;
      let defaultSet =
         timing.sampleSet > 0 ? timing.sampleSet : self.game.sampleSet;
      try {
         const snd = self.game.sample[defaultSet].sliderslide;
         if (!snd) return;
         snd.volume = volume;
         snd.loop = true;
         snd.play();
      } catch (e) {}
   };
   this._stopSliderSlide = function (hit) {
      for (let set = 1; set <= 3; set++) {
         try {
            if (self.game.sample[set] && self.game.sample[set].sliderslide)
               self.game.sample[set].sliderslide.stop();
         } catch (e) {}
      }
   };

   // Continuous spinnerspin sound (lazer: looped while a spinner is active)
   this._playSpinnerSpin = function (hit, time) {
      let timing =
         this.track.timingPoints[this.curtimingid] ||
         this.track.timingPoints[0];
      let volume =
         (self.game.masterVolume * self.game.effectVolume * timing.volume) /
         100;
      let defaultSet =
         timing.sampleSet > 0 ? timing.sampleSet : self.game.sampleSet;
      try {
         const snd = self.game.sample[defaultSet].spinnerspin;
         if (!snd) return;
         snd.volume = volume;
         snd.loop = true;
         snd.play();
      } catch (e) {}
   };
   this._stopSpinnerSpin = function () {
      for (let set = 1; set <= 3; set++) {
         try {
            if (self.game.sample[set] && self.game.sample[set].spinnerspin)
               self.game.sample[set].spinnerspin.stop();
         } catch (e) {}
      }
   };
   this.playHitsound = function playHitsound(hit, id, time) {
      while (
         this.curtimingid + 1 < this.track.timingPoints.length &&
         this.track.timingPoints[this.curtimingid + 1].offset <= time
      )
         this.curtimingid++;
      while (
         this.curtimingid > 0 &&
         this.track.timingPoints[this.curtimingid].offset > time
      )
         this.curtimingid--;
      let timing = this.track.timingPoints[this.curtimingid];
      let volume =
         (self.game.masterVolume *
            self.game.effectVolume *
            (hit.hitSample.volume != null
               ? hit.hitSample.volume
               : timing.volume)) /
         100;
      let defaultSet =
         timing.sampleSet > 0 ? timing.sampleSet : self.game.sampleSet;

      function playHit(bitmask, normalSet, additionSet) {
         // The normal sound is always played
         const norm =
            self.game.sample &&
            self.game.sample[normalSet] &&
            self.game.sample[normalSet].hitnormal;
         if (norm) {
            norm.volume = volume;
            try {
               norm.play();
            } catch (e) {}
         }
         if (bitmask & 2) {
            const w =
               self.game.sample &&
               self.game.sample[additionSet] &&
               self.game.sample[additionSet].hitwhistle;
            if (w) {
               w.volume = volume;
               try {
                  w.play();
               } catch (e) {}
            }
         }
         if (bitmask & 4) {
            const f =
               self.game.sample &&
               self.game.sample[additionSet] &&
               self.game.sample[additionSet].hitfinish;
            if (f) {
               f.volume = volume;
               try {
                  f.play();
               } catch (e) {}
            }
         }
         if (bitmask & 8) {
            const c =
               self.game.sample &&
               self.game.sample[additionSet] &&
               self.game.sample[additionSet].hitclap;
            if (c) {
               c.volume = volume;
               try {
                  c.play();
               } catch (e) {}
            }
         }
      }
      if (hit.type == "circle" || hit.type == "spinner") {
         let toplay = hit.hitSound;
         let normalSet = hit.hitSample.normalSet || defaultSet;
         let additionSet = hit.hitSample.additionSet || normalSet;
         playHit(toplay, normalSet, additionSet);
      }
      if (hit.type == "slider") {
         let toplay = hit.edgeHitsounds[id] || 0;
         let edgeSet = hit.edgeSets[id] || { normalSet: 0, additionSet: 0 };
         let normalSet = edgeSet.normalSet || defaultSet;
         let additionSet = edgeSet.additionSet || normalSet;
         playHit(toplay, normalSet, additionSet);
      }
   };

   this.hitSuccess = function hitSuccess(hit, points, time) {
      // T07 latency probe: when ?perfprobe=1, record the judgement spawn time
      // vs the input event timestamp. The user plays a map in a real browser;
      // the probe logs P50/P95 to the console every 50 judgements. See
      // scripts/headless-latency-probe.js header for the real-browser instructions.
      if (typeof window !== "undefined" && window.__perfProbe && hit) {
         try {
            window.__perfProbe.marks.push({ spawn: performance.now(), time, x: hit.x, y: hit.y });
            if (window.__perfProbe.marks.length >= 50) {
               const lats = window.__perfProbe.marks.map(m => m.spawn - m.time).filter(x => x >= 0 && isFinite(x)).sort((a, b) => a - b);
               const p50 = lats[Math.floor(lats.length * 0.5)] || 0;
               const p95 = lats[Math.floor(lats.length * 0.95)] || 0;
               console.log(`[perfprobe] n=${lats.length} P50=${p50.toFixed(1)}ms P95=${p95.toFixed(1)}ms`);
               window.__perfProbe.marks = [];
            }
         } catch {}
      }
      // Record this click for the click-grace logic in updateJudgement.
      self._lastClickTime = time;
      self._lastClickX =
         hit && hit.x != null ? hit.x : (self.game && self.game.mouseX) || 0;
      self._lastClickY =
         hit && hit.y != null ? hit.y : (self.game && self.game.mouseY) || 0;
      // Log the judgement so failures are diagnosable from the console.
      if (import.meta.env.DEV) {
         var label = (hit && hit.type) || "?";
         try {
            console.log(
               "judge",
               "type=" + label,
               "x=" + (hit && hit.x),
               "y=" + (hit && hit.y),
               "time=" + time,
               "points=" + points,
               "score=" + hit.score,
            );
         } catch (_) {}
      }
      // Target Practice: accuracy-based scoring — score from distance to center
      if (this.game.targetpractice && hit.type === "circle") {
         const dx = this.game.mouseX - hit.x;
         const dy = this.game.mouseY - hit.y;
         const dist = Math.hypot(dx, dy);
         const maxDist = this.circleRadius;
         // closer = more score (0..300 based on distance ratio)
         const acc = Math.max(0, 1 - dist / maxDist);
         points = Math.round(acc * 300);
         if (points < 50) points = 50; // minimum for a hit
      }
       let prevCombo = this.scoreOverlay.combo;
       this.scoreOverlay.hit(points, 300, time, { lastInCombo: !!hit.lastInCombo });
      // Lazer: record head hit for slider tracking gate (head must be hit for ticks to track)
      if (hit.type === "slider" && hit.sliderScorer) {
         try { hit.sliderScorer.recordHead(points > 0); } catch {}
      }
      // T11: combo color flash when combo goes 0 -> 1
      if (prevCombo === 0 && this.scoreOverlay.combo === 1 && points > 0) {
         try {
            let col =
               typeof combos !== "undefined" && combos.length
                  ? combos[hit.combo % combos.length]
                  : 0xffffff;
            let fx =
               hit.x != null ? hit.x : hit.basex != null ? hit.basex : 256;
            let fy =
               hit.y != null ? hit.y : hit.basey != null ? hit.basey : 192;
            self.createComboFlash(fx, fy, col, time);
         } catch (e) {}
      }
      if (points > 0) {
         try {
            if (hit.type == "spinner")
               self.playHitsound(hit, 0, hit.endTime); // hit happen at end of spinner
            else {
               self.playHitsound(hit, 0, hit.time);
               self.errorMeter.hit(time - hit.time, time);
            }
            if (hit.type == "slider") {
               // Lazer: the slider end is judged by the SliderJudge accumulator,
               // not the "missing end → 50" special case. No defaultScore override here.
            }
         } catch (e) {
            if (import.meta.env.DEV) console.warn("playHitsound failed", e);
         }
      }
      hit.score = points;
      hit.clickTime = time;
      // Bubbles mod: spawn a bubble at the hit position on successful hits
      if (this.game.bubbles && points > 0) {
         try {
            this.spawnBubble(hit.x, hit.y, time);
         } catch (e) {}
      }
      self.invokeJudgement(hit.judgements[0], points, time);
   };

   // hit object updating
   var futuremost = 0,
      current = 0;
   if (self.track.hitObjects.length > 0) {
      futuremost = self.track.hitObjects[0].time;
   }
   var waitinghitid = 0; // the first object that's not ended
   this.updateUpcoming = function (time) {
      while (
         waitinghitid < self.hits.length &&
         self.hits[waitinghitid].endTime < time
      )
         waitinghitid++;

      // Cache hit objects in the next 3 seconds — v8: addChild + zIndex, no addChildAt shifts
      while (current < self.hits.length && futuremost < time + 3000) {
         var hit = self.hits[current++];
         for (let i = hit.judgements.length - 1; i >= 0; i--) {
            self.gamefield.addChild(hit.judgements[i]);
         }
         for (let i = hit.objects.length - 1; i >= 0; i--) {
            self.gamefield.addChild(hit.objects[i]);
         }
         self.upcomingHits.push(hit);
         if (hit.time > futuremost) {
            futuremost = hit.time;
         }
      }
      for (var i = 0; i < self.upcomingHits.length; i++) {
         var hit = self.upcomingHits[i];
         var diff = hit.time - time;
         var despawn = -this.objectDespawnTime;
         if (hit.type === "slider") {
            despawn -= hit.sliderTimeTotal;
         }
         if (hit.type === "spinner") {
            despawn -= hit.endTime - hit.time;
         }
         if (diff < despawn) {
            // swap-remove: O(1) instead of splice O(n) shifting
            var lastIdx = self.upcomingHits.length - 1;
            if (i !== lastIdx)
               self.upcomingHits[i] = self.upcomingHits[lastIdx];
            self.upcomingHits.pop();
            i--; // recheck the swapped-in element
            hit.objects.forEach(function (o) {
               self.gamefield.removeChild(o);
               self._releaseToPool(o);
            });
            hit.judgements.forEach(function (o) {
               // T16: destroy any animated judgement sprite before returning to pool
               if (o._animSprite) {
                  try { o._animSprite.stop(); self.gamefield.removeChild(o._animSprite); o._animSprite.destroy(); } catch {}
                  o._animSprite = null;
               }
               self.gamefield.removeChild(o);
               if (o._pooledType === "text") {
                  if (self._judgeTextPool.length < self._POOL_MAX)
                     self._judgeTextPool.push(o);
                  else o.destroy();
               } else if (o._pooledTex) self._releaseToPool(o);
               else o.destroy();
            });
            // stop continuous sounds on despawn
            if (hit._slideSoundPlaying)
               try {
                  self._stopSliderSlide(hit);
               } catch {}
            hit._slideSoundPlaying = false;
            if (hit._spinSoundPlaying)
               try {
                  self._stopSpinnerSpin();
               } catch {}
            hit._spinSoundPlaying = false;
            hit.destroyed = true;
         }
      }
   };

   // this should be called on a follow point connection every frame when it's valid
   this.updateFollowPoints = function (f, time) {
      // animate followpoint frames if skin provides them (use game time, not wall clock)
      let hasAnim = !!(window.Skin && window.Skin?.["followpoint-0.png"]);
      const followFrames2 = (window.game && window.game.skinConfig && window.game.skinConfig.sliderBallFrames > 0)
         ? window.game.skinConfig.sliderBallFrames : 10;
      let animIdx = hasAnim ? Math.floor((time / 80) % followFrames2) : -1;
      let animTex = hasAnim
         ? window.Skin?.["followpoint-" + animIdx + ".png"] ||
           window.Skin?.["followpoint-0.png"]
         : null;
      for (let i = 0; i < f.children.length; ++i) {
         let o = f.children[i];
         if (hasAnim && animTex && o.texture !== animTex) o.texture = animTex;
         let startx = f.x1 + (o.fraction - 0.1) * f.dx;
         let starty = f.y1 + (o.fraction - 0.1) * f.dy;
         let endx = f.x1 + o.fraction * f.dx;
         let endy = f.y1 + o.fraction * f.dy;
         let fadeOutTime = f.t1 + o.fraction * f.dt;
         let fadeInTime = fadeOutTime - f.preempt;
         let relpos = clamp01((time - fadeInTime) / f.hit.objectFadeInTime);
         relpos *= 2 - relpos; // ease out
         o.x = startx + (endx - startx) * relpos;
         o.y = starty + (endy - starty) * relpos;
         o.alpha =
            0.5 *
            (time < fadeOutTime
               ? clamp01((time - fadeInTime) / f.hit.objectFadeInTime)
               : 1 - clamp01((time - fadeOutTime) / f.hit.objectFadeInTime));
      }
   };

   this.updateHitCircle = function (hit, time) {
      if (hit.followPoints) this.updateFollowPoints(hit.followPoints, time);
      let diff = hit.time - time; // milliseconds before time of circle
      // update approach circle
      let approachFullAppear = this.approachTime - this.approachFadeInTime; // duration of opaque approach circle when approaching
      if (diff <= this.approachTime && diff > 0) {
         // approaching
         let scalemul = (diff / this.approachTime) * this.approachScale + 1;
         hit.approach.scale.set(0.5 * this.hitSpriteScale * scalemul);
      } else {
         hit.approach.scale.set(0.5 * this.hitSpriteScale);
      }
      if (diff <= this.approachTime && diff > approachFullAppear) {
         // approach circle fading in
         hit.approach.alpha =
            (this.approachTime - diff) / this.approachFadeInTime;
      } else if (diff <= approachFullAppear && hit.score < 0) {
         // approach circle opaque, just shrinking
         hit.approach.alpha = 1;
      }
      // calculate opacity of circle
      let noteFullAppear = this.approachTime - hit.objectFadeInTime; // duration of opaque hit circle when approaching

      function setcircleAlpha(alpha) {
         hit.base.alpha = alpha;
         hit.circle.alpha = alpha;
         for (let i = 0; i < hit.numbers.length; ++i)
            hit.numbers[i].alpha = alpha;
         hit.glow.alpha = alpha * self.glowMaxOpacity;
      }
      if (diff <= this.approachTime && diff > noteFullAppear) {
         // fading in
         let alpha = (this.approachTime - diff) / hit.objectFadeInTime;
         setcircleAlpha(alpha);
      } else if (diff <= noteFullAppear) {
         if (-diff > hit.objectFadeOutOffset) {
            // fading out
            let timeAfter = -diff - hit.objectFadeOutOffset;
            setcircleAlpha(clamp01(1 - timeAfter / hit.circleFadeOutTime));
            hit.approach.alpha = clamp01(1 - timeAfter / 50);
         } else {
            setcircleAlpha(1);
         }
      }
      // flash out if clicked
      if (hit.score > 0 && hit.enableflash) {
         hit.burst.visible = true;
         let timeAfter = time - hit.clickTime;
         let t = timeAfter / this.glowFadeOutTime;
         let newscale = 1 + 0.5 * t * (2 - t);
         hit.burst.scale.set(newscale * hit.burst.initialscale);
         hit.glow.scale.set(newscale * hit.glow.initialscale);
         hit.burst.alpha =
            this.flashMaxOpacity *
            clamp01(
               timeAfter < this.flashFadeInTime
                  ? timeAfter / this.flashFadeInTime
                  : 1 -
                       (timeAfter - this.flashFadeInTime) /
                          this.flashFadeOutTime,
            );
         hit.glow.alpha =
            clamp01(1 - timeAfter / this.glowFadeOutTime) * this.glowMaxOpacity;

         if (hit.base.visible) {
            if (timeAfter < this.flashFadeInTime) {
               hit.base.scale.set(newscale * hit.base.initialscale);
               hit.circle.scale.set(newscale * hit.circle.initialscale);
               for (let i = 0; i < hit.numbers.length; ++i)
                  hit.numbers[i].scale.set(
                     newscale * hit.numbers[i].initialscale,
                  );
            } else {
               // hide circle
               hit.base.visible = false;
               hit.circle.visible = false;
               for (let i = 0; i < hit.numbers.length; ++i)
                  hit.numbers[i].visible = false;
               hit.approach.visible = false;
            }
         }
      }
      this.updateJudgement(hit.judgements[0], time);
   };

   this.updateSlider = function (hit, time) {
      // just make use of the duplicate part
      this.updateHitCircle(hit, time);

      let noteFullAppear = this.approachTime - hit.objectFadeInTime; // duration of opaque hit circle when approaching

      hit.body.startt = 0.0;
      hit.body.endt = 1.0;

      // set opacity of slider body
      function setbodyAlpha(alpha) {
         hit.body.alpha = alpha;
         for (let i = 0; i < hit.ticks.length; ++i) hit.ticks[i].alpha = alpha;
         if (hit.endCircle) hit.endCircle.alpha = alpha;
         if (hit.endOverlay) hit.endOverlay.alpha = alpha;
      }
      let diff = hit.time - time; // milliseconds before hit.time
      if (diff <= this.approachTime && diff > noteFullAppear) {
         // Fade in (before hit)
         setbodyAlpha((this.approachTime - diff) / hit.objectFadeInTime);
         if (hit.reverse) hit.reverse.alpha = hit.body.alpha;
         if (hit.reverse_b) hit.reverse_b.alpha = hit.body.alpha;
      } else if (diff <= noteFullAppear) {
         if (-diff > hit.fadeOutOffset) {
            let t = clamp01((-diff - hit.fadeOutOffset) / hit.fadeOutDuration);
            setbodyAlpha(1 - t * (2 - t));
         } else {
            setbodyAlpha(1);
            if (hit.reverse) hit.reverse.alpha = 1;
            if (hit.reverse_b) hit.reverse_b.alpha = 1;
         }
      }
      if (this.game.snakein) {
         if (diff > 0) {
            // Lazer snakes in over the full approach time (TimePreempt), not approachTime/3.
            // The body starts snaking at hit.time - approachTime and completes at hit.time.
            let t = clamp01(
               (time - (hit.time - this.approachTime)) / this.approachTime,
            );
            hit.body.endt = t;
            if (hit.reverse) {
               hit.curve.pointAtInto
                  ? hit.curve.pointAtInto(t, self._tmpPt1)
                  : (self._tmpPt1 = hit.curve.pointAt(t));
               hit.reverse.x = self._tmpPt1.x;
               hit.reverse.y = self._tmpPt1.y;
               if (t < 0.5) {
                  hit.curve.pointAtInto
                     ? hit.curve.pointAtInto(t + 0.005, self._tmpPt2)
                     : (self._tmpPt2 = hit.curve.pointAt(t + 0.005));
                  hit.reverse.rotation = Math.atan2(
                     self._tmpPt1.y - self._tmpPt2.y,
                     self._tmpPt1.x - self._tmpPt2.x,
                  );
               } else {
                  hit.curve.pointAtInto
                     ? hit.curve.pointAtInto(t - 0.005, self._tmpPt2)
                     : (self._tmpPt2 = hit.curve.pointAt(t - 0.005));
                  hit.reverse.rotation = Math.atan2(
                     self._tmpPt2.y - self._tmpPt1.y,
                     self._tmpPt2.x - self._tmpPt1.x,
                  );
               }
            }
         }
      }

      // set position of slider ball & follow circle
      // approach circle & hit circle moves along fading

      function resizeFollow(hit, time, dir) {
         if (!hit.followLasttime) hit.followLasttime = time;
         if (!hit.followLinearSize) hit.followLinearSize = 1;
         let dt = time - hit.followLasttime;
         hit.followLinearSize = Math.max(
            1,
            Math.min(2, hit.followLinearSize + dt * dir),
         );
         hit.followSize = hit.followLinearSize; // easing can happen here
         hit.followLasttime = time;
      }

      if (-diff >= 0 && -diff <= hit.fadeOutDuration + hit.sliderTimeTotal) {
         // after hit.time & before slider disappears
         // t: position relative to slider duration
         let t = hit.sliderTime > 0 ? -diff / hit.sliderTime : 0;
         hit.currentRepeat = Math.min(Math.ceil(t), hit.repeat);
         // check for slider edge hit
         let atEnd = false;
         if (Math.floor(t) > hit.lastrep) {
            hit.lastrep = Math.floor(t);
            if (hit.lastrep > 0 && hit.lastrep <= hit.repeat) atEnd = true;
         }
         // clamp t
         t = repeatclamp(Math.min(t, hit.repeat));

         // Update ball and follow circle position — reuse tmp point to avoid alloc
         hit.curve.pointAtInto
            ? hit.curve.pointAtInto(t, self._tmpPt1)
            : (self._tmpPt1 = hit.curve.pointAt(t));

         hit.follow.x = self._tmpPt1.x;
         hit.follow.y = self._tmpPt1.y;
         hit.ball.x = self._tmpPt1.x;
         hit.ball.y = self._tmpPt1.y;

         if (hit.base.visible && hit.score <= 0) {
            // the hit circle at start of slider will move if not hit
            hit.base.x = self._tmpPt1.x;
            hit.base.y = self._tmpPt1.y;
            hit.circle.x = self._tmpPt1.x;
            hit.circle.y = self._tmpPt1.y;
            for (let i = 0; i < hit.numbers.length; ++i) {
               hit.numbers[i].x = self._tmpPt1.x;
               hit.numbers[i].y = self._tmpPt1.y;
            }
            hit.glow.x = self._tmpPt1.x;
            hit.glow.y = self._tmpPt1.y;
            hit.burst.x = self._tmpPt1.x;
            hit.burst.y = self._tmpPt1.y;
            hit.approach.x = self._tmpPt1.x;
            hit.approach.y = self._tmpPt1.y;
         }

         let dx = game.mouseX - self._tmpPt1.x;
         let dy = game.mouseY - self._tmpPt1.y;
         let followPixelSize = hit.followSize * this.circleRadius;
         let isfollowing =
            dx * dx + dy * dy <= followPixelSize * followPixelSize;
         game.mouseInto
            ? game.mouseInto(this.realtime, self._tmpMouse)
            : (self._tmpMouse = game.mouse(this.realtime));
         let dx1 = self._tmpMouse.x - self._tmpPt1.x;
         let dy1 = self._tmpMouse.y - self._tmpPt1.y;
         isfollowing |=
            dx1 * dx1 + dy1 * dy1 <=
            (followPixelSize + self._tmpMouse.r) *
               (followPixelSize + self._tmpMouse.r);
         let activated =
            (this.game.down && isfollowing) || hit.followSize > 1.01;

         // Flashlight: track slider-following state for the slider dim
         if (this.flOverlay) this._flSetFollowing(activated && isfollowing);

         // Continuous sliderslide sound (lazer: looped while following)
         const slideActive = activated && isfollowing;
         if (slideActive && !hit._slideSoundPlaying) {
            hit._slideSoundPlaying = true;
            try {
               this._playSliderSlide(hit, time);
            } catch (e) {}
         } else if (!slideActive && hit._slideSoundPlaying) {
            hit._slideSoundPlaying = false;
            try {
               this._stopSliderSlide(hit);
            } catch (e) {}
         }

         // Lazer per-part judgement: scorer handles ticks/repeats/tail when flag on
         // Guard for degenerate/offscreen sliders (e.g. x=0 due to stacking/HR edge case):
         // The reported slider at 0,318 caused 1-hit-10-miss because it was scored
         // per-tick but never tracked. Treat edge-positioned or tiny sliders as
         // degenerate and skip per-tick scoring.
         const isDegenerateSlider = hit.type === "slider" && (
            hit.x == null || hit.y == null ||
            hit.x <= 0 || hit.x >= 512 || hit.y <= 0 || hit.y >= 384 ||
            (hit.pixelLength != null && hit.pixelLength < 5) ||
            (!hit.curve || !hit.curve.curve || hit.curve.curve.length < 2) ||
            (hit.x === 0 && hit.y === 318) // specific reported degenerate slider
         );
          if (window.FEATURES && window.FEATURES.lazerSliderJudging && hit.sliderScorer && !isDegenerateSlider) {
             // Skip sliderScorer.update on a scrub frame (lead-in seek / resume):
             // the parts are "due" only because the clock jumped past them, not
             // because the user failed to track. Without this guard, the first
             // frame after a seek fires LargeTickMiss/IgnoreMiss for every due
             // part → instant fail.
             if (!self._scrubFrame) {
                try { hit.sliderScorer.update(time, !!activated); } catch {}
             }
          } else if (isDegenerateSlider && hit.type === "slider") {
            // Degenerate slider: just handle as a single hit, no per-tick
            // The head's hitSuccess already handled the main judgement
         }
         // slider tick judgement — immediate scoring (lazer SmallTickHit = 10) + accumulator (legacy, flag-off)
         if (
            !(window.FEATURES && window.FEATURES.lazerSliderJudging) &&
            hit.nexttick < hit.ticks.length &&
            time >= hit.ticks[hit.nexttick].time
         ) {
            if (activated) {
               hit.ticks[hit.nexttick].result = true;
               self.playTicksound(hit, hit.ticks[hit.nexttick].time);
               hit.sliderJudge.recordTick(hit, time);
            } else {
               hit.sliderJudge.recordTickMiss(time);
            }
            self.scoreOverlay.hit(activated ? 10 : 0, 10, time);
            hit.nexttick++;
         }

         // slider edge judgement — immediate scoring (legacy, flag-off)
         // Note: being tolerant if follow circle hasn't shrinked to minimum
         if (!(window.FEATURES && window.FEATURES.lazerSliderJudging) && atEnd && activated) {
            let prevEdgeCombo = self.scoreOverlay.combo;
            hit.sliderJudge.recordEdge(hit, time);
            self.invokeJudgement(hit.judgements[hit.lastrep], 300, time);
            self.scoreOverlay.hit(30, 30, time); // lazer edge = 30 (was 300)
            if (prevEdgeCombo === 0 && self.scoreOverlay.combo === 1) {
               try {
                  let col =
                     typeof combos !== "undefined" && combos.length
                        ? combos[hit.combo % combos.length]
                        : 0xffffff;
                  let j = hit.judgements[hit.lastrep];
                  let fx = j && j.basex != null ? j.basex : hit.x;
                  let fy = j && j.basey != null ? j.basey : hit.y;
                  self.createComboFlash(fx, fy, col, time);
               } catch (e) {}
            }
            try {
               self.playHitsound(
                  hit,
                  hit.lastrep,
                  hit.time + hit.lastrep * hit.sliderTime,
               );
            } catch (e) {}
          } else if (!(window.FEATURES && window.FEATURES.lazerSliderJudging) && atEnd && !activated) {
            // edge missed — record to accumulator (legacy)
            hit.sliderJudge.recordEdgeMiss(time);
         }

         // sliderball & follow circle Animation
         if (-diff >= 0 && -diff <= hit.sliderTimeTotal) {
            // slider ball immediately emerges
            hit.ball.visible = true;
            hit.ball.alpha = 1;
            if (hit._ballFrameCount > 0) {
               let bIdx = Math.floor((time / 100) % hit._ballFrameCount);
               let bTex =
                  window.Skin?.["sliderb" + bIdx + ".png"] ||
                  PIXI.Texture.WHITE;
               if (bTex && hit.ball.texture !== bTex) hit.ball.texture = bTex;
            }
            if (window.game && window.game.allowSliderBallTint) {
               try {
                  hit.ball.tint = combos[hit.combo % combos.length];
               } catch (e) {}
            }
            // follow circle immediately emerges and gradually enlarges — keep faintly visible even when not following (integral to gameplay)
            hit.follow.visible = true;
            if (this.game.down && isfollowing)
               resizeFollow(hit, time, 1 / this.followZoomInTime); // expand
            else resizeFollow(hit, time, -1 / this.followZoomInTime); // shrink
            let followscale = hit.followSize * 0.45 * this.hitSpriteScale;
            hit.follow.scale.x = hit.follow.scale.y = followscale;
            // was hit.followSize -1 (0 at rest, invisible) -> keep base visibility 0.25
            hit.follow.alpha = Math.max(0.25, hit.followSize - 0.6) * 0.9;
            // outline: ensure follow circle has visible border even at rest
            if (hit.follow.alpha < 0.25) hit.follow.alpha = 0.25;
         }
         let timeAfter = -diff - hit.sliderTimeTotal;
         if (timeAfter > 0) {
            resizeFollow(hit, time, -1 / this.followZoomInTime); // shrink
            let followscale = hit.followSize * 0.45 * this.hitSpriteScale;
            hit.follow.scale.x = hit.follow.scale.y = followscale;
            hit.follow.alpha = Math.max(0, hit.followSize - 1) * 0.6;
            hit.ball.alpha = this.fadeOutEasing(
               timeAfter / this.ballFadeOutTime,
            );
            let ballscale =
               (1 + (0.15 * timeAfter) / this.ballFadeOutTime) *
               0.5 *
               this.hitSpriteScale;
            hit.ball.scale.x = hit.ball.scale.y = ballscale;
         }

         // reverse arrow with fade-out (100ms) after final repeat
         if (hit.repeat > 1) {
            let finalrepfromA = hit.repeat - (hit.repeat % 2); // even
            let finalrepfromB = hit.repeat - 1 + (hit.repeat % 2); // odd
            let hideA = hit.time + finalrepfromA * hit.sliderTime;
            let hideB = hit.time + finalrepfromB * hit.sliderTime;
            if (hit.currentRepeat < finalrepfromA) {
               hit.reverse.visible = true;
               hit.reverse.alpha = 1;
            } else {
               let tA = time - hideA;
               if (tA < 100) {
                  hit.reverse.visible = true;
                  hit.reverse.alpha = clamp01(1 - tA / 100);
               } else hit.reverse.visible = false;
            }
            if (hit.reverse_b) {
               if (hit.currentRepeat < finalrepfromB) {
                  hit.reverse_b.visible = true;
                  hit.reverse_b.alpha = 1;
               } else {
                  let tB = time - hideB;
                  if (tB < 100) {
                     hit.reverse_b.visible = true;
                     hit.reverse_b.alpha = clamp01(1 - tB / 100);
                  } else hit.reverse_b.visible = false;
               }
            }
         }

         // update snaking out portion
         if (this.game.snakeout) {
            if (hit.currentRepeat == hit.repeat) {
               if (hit.repeat % 2 == 1) {
                  hit.body.startt = t;
                  hit.body.endt = 1.0;
               } else {
                  hit.body.startt = 0.0;
                  hit.body.endt = t;
               }
            }
         }
      }

      // calculate ticks fade in/out — absolute alpha (frame-rate independent)
      for (let i = 0; i < hit.ticks.length; ++i) {
         if (time < hit.ticks[i].appeartime) {
            // fade in
            let dt = hit.ticks[i].appeartime - time;
            hit.ticks[i].alpha = clamp01(1 - dt / 500);
            hit.ticks[i].scale.set(
               0.5 *
                  this.hitSpriteScale *
                  (0.5 + 0.5 * clamp01((1 - dt / 500) * (1 + dt / 500))),
            );
         } else {
            hit.ticks[i].scale.set(0.5 * this.hitSpriteScale);
         }
         if (time >= hit.ticks[i].time) {
            let dt = time - hit.ticks[i].time;
            if (hit.ticks[i].result) {
               // hit
               hit.ticks[i].alpha = clamp01(-Math.pow(dt / 150 - 1, 5));
               hit.ticks[i].scale.set(
                  0.5 *
                     this.hitSpriteScale *
                     (1 + 0.5 * (dt / 150) * (2 - dt / 150)),
               );
            } else {
               // missed
               hit.ticks[i].alpha = clamp01(1 - dt / 150);
               hit.ticks[i].tint = colorLerp(
                  0xffffff,
                  0xff0000,
                  clamp01(dt / 75),
               );
            }
         }
      }

      // display hit score
      for (let i = 0; i < hit.judgements.length; ++i)
         this.updateJudgement(hit.judgements[i], time);

      // Lazer slider final judgement: emit once at slider end from the accumulator.
      // The tail judgement (last edge) already fired above; this is the overall
      // slider result that lazer scores as the slider's main judgement.
      if (
         hit.sliderJudge &&
         hit.sliderJudge._finalScore < 0 &&
         time > hit.endTime
      ) {
         const finalScore = hit.sliderJudge.finalScore();
          // emit via the last judgement slot (the slider-end judgement)
          const tailJudge = hit.judgements[hit.judgements.length - 1];
          if (tailJudge && tailJudge.points < 0) {
             self.invokeJudgement(tailJudge, finalScore, hit.endTime);
             self.scoreOverlay.hit(finalScore, 300, hit.endTime, { lastInCombo: !!tailJudge.lastInCombo });
          }
      }
   };

   this.updateSpinner = function (hit, time) {
      // Continuous spinnerspin sound (lazer: looped while the spinner is active)
      if (time >= hit.time && time <= hit.endTime && !hit._spinSoundPlaying) {
         hit._spinSoundPlaying = true;
         try {
            this._playSpinnerSpin(hit, time);
         } catch (e) {}
      } else if (time > hit.endTime && hit._spinSoundPlaying) {
         hit._spinSoundPlaying = false;
         try {
            this._stopSpinnerSpin();
         } catch (e) {}
      }
      // update rotation
      if (time >= hit.time && time <= hit.endTime) {
         if (this.game.spunout) {
            // Spun Out: auto-rotate the spinner to completion
            let frac = (time - hit.time) / Math.max(1, hit.endTime - hit.time);
            hit.rotationProgress = hit.rotationRequired * frac;
            hit.rotation = hit.rotationProgress;
         } else if (this.game.down) {
            let Xr = this.game.mouseX - hit.x;
            let Yr = this.game.mouseY - hit.y;
            let mouseAngle = Math.atan2(Yr, Xr);
            if (!hit.clicked) {
               hit.clicked = true;
            } else {
               let delta = mouseAngle - hit.lastAngle;
               if (delta > Math.PI) delta -= Math.PI * 2;
               if (delta < -Math.PI) delta += Math.PI * 2;
               hit.rotation += delta;
               hit.rotationProgress += Math.abs(delta);
            }
            hit.lastAngle = mouseAngle;
         } else {
            hit.clicked = false;
         }
      }

      // calculate opacity of spinner
      let alpha = 0;
      if (time >= hit.time - self.spinnerZoomInTime - self.spinnerAppearTime) {
         if (time <= hit.endTime) alpha = 1;
         else
            alpha = clamp01(1 - (time - hit.endTime) / self.spinnerFadeOutTime);
      }
      hit.top.alpha = alpha;
      hit.progress.alpha = alpha;
      hit.base.alpha = alpha;

      // calculate scales of components
      if (time < hit.endTime) {
         // top zoom in first
         hit.top.scale.set(
            0.3 *
               clamp01(
                  (time -
                     (hit.time -
                        self.spinnerZoomInTime -
                        self.spinnerAppearTime)) /
                     self.spinnerZoomInTime,
               ),
         );
         hit.base.scale.set(
            0.6 *
               clamp01(
                  (time - (hit.time - self.spinnerZoomInTime)) /
                     self.spinnerZoomInTime,
               ),
         );
      }
      if (time < hit.time) {
         let t =
            (hit.time - time) /
            (self.spinnerZoomInTime + self.spinnerAppearTime);
         if (t <= 1) hit.top.rotation = -t * t * 10;
      }
      let progress =
         hit.rotationRequired > 0
            ? hit.rotationProgress / hit.rotationRequired
            : 0;
      if (time > hit.time) {
         hit.base.rotation = hit.rotation / 2;
         hit.top.rotation = hit.rotation / 2;
         hit.progress.scale.set(0.6 * (0.13 + 0.87 * clamp01(progress)));
      } else {
         hit.progress.scale.set(0);
      }

      if (time >= hit.endTime) {
         if (hit.score < 0) {
            let points = 0;
            if (progress >= 1) points = 300;
            else if (progress >= 0.9) points = 100;
            else if (progress >= 0.75) points = 50;
            this.hitSuccess(hit, points, hit.endTime);
         }
      }
      this.updateJudgement(hit.judgements[0], time);
   };

   this.updateHitObjects = function (time) {
      self.updateUpcoming(time);
      // Fun-mod geometry transforms (Wobble, Depth, Transform, Traceable, NoScope)
      // applied per-frame before the per-hit update.
      self._applyFunModTransforms(time);
      for (var i = self.upcomingHits.length - 1; i >= 0; i--) {
         var hit = self.upcomingHits[i];
         switch (hit.type) {
            case "circle":
               self.updateHitCircle(hit, time);
               break;
            case "slider":
               self.updateSlider(hit, time);
               break;
            case "spinner":
               self.updateSpinner(hit, time);
               break;
         }
      }
   };

   this.updateBackground = function (time) {
      if (!self.background) return;
      let fade = self.game.backgroundDimRate;
      if (time < -self.wait)
         fade *= Math.max(0, 1 - (-self.wait - time) / self.backgroundFadeTime);
      // tint dims to black; alpha must stay at 1 so the background is actually visible.
      // (Previously alpha was set to 0 and never updated, leaving the screen black.)
      self.background.alpha = 1;
      self.background.tint = colorLerp(0xffffff, 0, fade);
   };

   this.render = function (timestamp) {
      this.realtime = performance.now();
      if (window.lastPlaybackRenderTime) {
         window.currentFrameInterval =
            this.realtime - window.lastPlaybackRenderTime;
      }
      window.lastPlaybackRenderTime = this.realtime;
      // Collect frametime samples for the benchmark harness.
      if (window.__benchCollect) {
         if (!window.__benchFrames) window.__benchFrames = [];
         var _dt = window.currentFrameInterval || 16.67;
         window.__benchFrames.push({ dt: _dt, t: this.realtime });
         if (window.__benchFrames.length > 600) window.__benchFrames.shift();
      }

      var time;
      if (this.audioReady) {
         time = osu.audio.getPosition() * 1000 + self.offset;
      }
      // Detect audio position jumps (scrub / resume / lead-in seek): a healthy
      // frame advances by < 1 frame (~33ms). Anything > 200ms means the clock
      // jumped (user seeked, or audio sought to first hit during lead-in). Mark
      // this frame as "scrub" so per-hit miss checks don't fire a burst of
      // misses. The user must re-press the key on the scrubbed-to position, so
      // we never award hits for the gap; we only avoid *punishing* them for it.
      // Scrub-only guard (restored): the per-frame miss CAP that caused the
      // original "burst-miss on first tap" bug is NOT restored — only the
      // scrub detector. A scrub frame skips ALL miss checks; a normal frame
      // lets every due miss fire (no cap).
       if (typeof time === "number") {
          if (self._lastGameTime >= 0) {
             var dt = time - self._lastGameTime;
             self._scrubFrame = dt > 200 || dt < -50;
          } else {
             // First frame: the audio may have already sought past 0 during
             // lead-in (the audio starts at a position matching the beatmap's
             // first hit object). Mark as scrub so any hits already past their
             // finalTime on this first frame don't fire instant misses.
             self._scrubFrame = true;
          }
          self._lastGameTime = time;
      } else {
         self._scrubFrame = false;
      }
      if (typeof time !== "undefined") {
         if (this.started && this.replayFrames && !this.replayMode) {
            this.replayFrames.push({
               t: time,
               x: this.game.mouseX,
               y: this.game.mouseY,
               d: this.game.down,
            });
            if (this.replayFrames.length > 201000)
               this.replayFrames = this.replayFrames.slice(-200000);
         }
         let nextapproachtime =
            waitinghitid < this.hits.length &&
            this.hits[waitinghitid].time -
               (this.hits[waitinghitid].approachTime || this.approachTime) >
               time
               ? this.hits[waitinghitid].time -
                 (this.hits[waitinghitid].approachTime || this.approachTime)
               : -1;
         try {
            this.breakOverlay.countdown(nextapproachtime, time);
         } catch (e) {}
         this.updateBackground(time);
         try {
            this.updateHitObjects(time);
         } catch (e) {
            if (import.meta.env.DEV) console.warn("updateHitObjects failed", e);
         }
         try {
            this.updateEffects(time);
         } catch (e) {}
         if (this._bubbles.length)
            try {
               this.updateBubbles(time);
            } catch (e) {}
         try {
            this.scoreOverlay.update(time);
         } catch (e) {}
         try {
            this.game.updatePlayerActions(time);
         } catch (e) {}
         try {
            this.progressOverlay.update(time);
         } catch (e) {}
         try {
            this.errorMeter.update(time);
         } catch (e) {}
         if (this.flOverlay)
            try {
               this.updateFlashlight(time);
            } catch (e) {}
         // Adaptive Speed: adjust playback rate based on recent accuracy
         if (this.game.adaptiveSpeed && this.osu && this.osu.audio) {
            try {
               this.updateAdaptiveSpeed(time);
            } catch (e) {}
         }
      } else {
         this.updateBackground(-100000);
      }
      this.volumeMenu.update(timestamp);
      this.loadingMenu.update(timestamp);

      if (time !== undefined && time > this.endTime) {
         // game ends
         if (!this.ended) {
            this.ended = true;
            this.pause = function () {};
            this.scoreOverlay.visible = false;
            this.scoreOverlay.showSummary(
               this.track.metadata,
               this.errorMeter.record,
               this.retry,
               this.quit,
            );
         }
         if (self.background) self.background.tint = 0xffffff;
      }
   };

   this.destroy = function () {
      // clean up
      self.hits.forEach(function (hit) {
         if (!hit.destroyed) {
            hit.objects.forEach(function (o) {
               self.gamefield.removeChild(o);
               o.destroy();
            });
            hit.judgements.forEach(function (o) {
               self.gamefield.removeChild(o);
               o.destroy();
            });
            hit.destroyed = true;
         }
      });
      // drain the sprite pool (game ending; no reuse)
      if (self._spritePool) {
         self._spritePool.forEach(function (arr) {
            for (let i = 0; i < arr.length; i++) arr[i].destroy();
         });
         self._spritePool.clear();
      }
      if (self._judgeTextPool) {
         for (let i = 0; i < self._judgeTextPool.length; i++)
            self._judgeTextPool[i].destroy();
         self._judgeTextPool.length = 0;
      }
      if (self._hitBursts) {
         for (let i = 0; i < self._hitBursts.length; i++)
            try {
               self.gamefield.removeChild(self._hitBursts[i]);
               self._hitBursts[i].destroy();
            } catch (e) {}
         self._hitBursts.length = 0;
      }
      if (self._comboFlashes) {
         for (let i = 0; i < self._comboFlashes.length; i++)
            try {
               self.gamefield.removeChild(self._comboFlashes[i]);
               self._comboFlashes[i].destroy();
            } catch (e) {}
         self._comboFlashes.length = 0;
      }
      let opt = {
         children: true,
         texture: false,
      };
      self.scoreOverlay.destroy(opt);
      self.errorMeter.destroy(opt);
      self.loadingMenu.destroy(opt);
      self.volumeMenu.destroy(opt);
      self.breakOverlay.destroy(opt);
      self.progressOverlay.destroy(opt);
      self.gamefield.destroy(opt);
      // FL overlay cleanup
      if (self.flOverlay) {
         try {
            self.game.stage.removeChild(self.flOverlay);
            self.flOverlay.destroy();
         } catch {}
         self.flOverlay = null;
      }
      if (self.flSliderDim) {
         try {
            self.game.stage.removeChild(self.flSliderDim);
            self.flSliderDim.destroy();
         } catch {}
         self.flSliderDim = null;
      }
      if (self.background) {
         try {
            const tex = self.background.texture;
            if (tex && tex !== PIXI.Texture.WHITE && tex.destroy) {
               try {
                  tex.destroy(true);
               } catch {}
            }
         } catch {}
         try {
            self.game.stage.removeChild(self.background);
         } catch {}
         self.background.destroy({ children: true, texture: false });
         self.background = null;
      }
      // clean up event listeners
      window.removeEventListener("resize", resizeCallback);
      window.removeEventListener("blur", blurCallback);
      window.removeEventListener("wheel", wheelCallback);
      window.removeEventListener("keydown", pauseKeyCallback);
      window.removeEventListener("keyup", resumeKeyCallback);
      window.removeEventListener("keydown", skipKeyCallback);
      self.game.cleanupPlayerActions();
      // flush deferred skin texture unload (safe now — all gameplay sprites destroyed)
      if (window._pendingUnload) {
         for (const item of window._pendingUnload) {
            try {
               if (item.url && PIXI.Assets.cache.has(item.url))
                  PIXI.Assets.unload(item.url);
            } catch {}
            try {
               if (item.url) URL.revokeObjectURL(item.url);
            } catch {}
            try {
               if (
                  item.tex &&
                  item.tex !== PIXI.Texture.WHITE &&
                  item.tex.destroy
               )
                  item.tex.destroy(true);
            } catch {}
         }
         window._pendingUnload = null;
      }
      self.render = function () {};
   };

   this.start = function () {
      self.started = true;
      self.skipped = false;
      self.osu.audio.gain.gain.value =
         self.game.musicVolume * self.game.masterVolume;
      self.osu.audio.playbackRate = self.playbackRate;
      self.osu.audio.play(self.backgroundFadeTime + self.wait);
   };

   this.retry = function () {
      if (!self.game.paused) {
         self.osu.audio.pause();
         self.game.paused = true;
      }
      self.destroy();
      self.constructor(self.game, self.osu, self.track);
      self.loadingMenu.hide();
      self.audioReady = true;
      self.start();
   };

   this.quit = function () {
      if (!self.game.paused) {
         self.osu.audio.pause();
         self.game.paused = true;
      }
      self.destroy();
      if (window.quitGame) window.quitGame();
   };

   this.skip = function () {
      if (self.osu.audio && self.osu.audio.seekforward(self.skipTime)) {
         self.skipped = true;
      }
   };
}

export default Playback;
