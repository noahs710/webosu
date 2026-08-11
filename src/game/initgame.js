import Osu from "./osu.js";
import { loadCachedSkin, applySkin } from "./skin-loader.js";
import { validateSkin, validateHitsounds } from "./skin-loader.js";
import Playback from "./playback.js";
import { log as ilog, warn as iwarn, error as ierror } from "./logger.js";
import { gamesettings } from "../shell/gamesettings.js";
import { ModRegistry } from "./mods/index.js";
// Register all mods with the registry (side-effect import)
import "./mods/register.js";

   window.Osu = Osu;
   window.Playback = Playback;
   window.ModRegistry = ModRegistry;
   // setup compatible audio context
   window.AudioContext = window.AudioContext || window.webkitAudioContext;

   // initialize global game variables
   var game = {
      window: window,
      stage: null,
      scene: null,
      updatePlayerActions: null,

      // note: preference values here will be overwritten by gamesettings (in settings.js)
      // display
      backgroundDimRate: 0.7,
      backgroundBlurRate: 0.0,
      cursorSize: 1.0,
      showhwmouse: false,
      snakein: true,
      snakeout: true,

      // audio
      masterVolume: 0.7,
      effectVolume: 1.0,
      musicVolume: 1.0,
      beatmapHitsound: true,
      globalOffset: 0,

      // input
      allowMouseButton: false,
      allowMouseScroll: true,
      K1keycode: 90,
      K2keycode: 88,
      ESCkeycode: 27,
      ESC2keycode: 27,

      // mods (flat boolean flags — DEPRECATED, kept as aliases for one release;
      // new code should read window.ModRegistry.getActive() / game.mods instead)
      autoplay: false,
      replayMode: false,
      nightcore: false,
      daycore: false,
      hardrock: false,
      easy: false,
      hidden: false,

      nofail: false,
      suddendeath: false,
      perfect: false,
      spunout: false,
      classic: false,
      difficultyAdjust: false,
      customAR: 0,
      customCS: 0,
      customOD: 0,
      customHP: 0,

      // mods — the new Mod instance array (populated by gamesettings.loadToGame via ModRegistry)
      mods: [],

      // skin mods
      hideNumbers: false,
      hideGreat: true,
      hideFollowPoints: false,

      // cursor info
      mouseX: 0, // in osu pixel, probably negative or exceeding 512
      mouseY: 0,
      mouse: null, // return {x,y,r} in osu pixel, probably negative or exceeding 512
      K1down: false,
      K2down: false,
      M1down: false,
      M2down: false,
      down: false,

      finished: false,
      sample: [{}, {}, {}, {}],
      sampleSet: 1,
   };
   window.currentFrameInterval = 16;
   window.game = game;
   try { gamesettings.loadToGame(); ilog("initgame", "applied gamesettings to game", { autoplay: game.autoplay, hidden: game.hidden }); } catch (e) { iwarn("initgame", "gamesettings loadToGame failed", e); }
   // keep window.gamesettings in sync for legacy checks
   window.gamesettings = gamesettings;
   window.skinReady = false;
   window.soundReady = false;
   window.scriptReady = false;
   game.stage = new PIXI.Container();
   game.stage.sortableChildren = true; // v8: zIndex-based layering (cursor on top, HUD below)
   game.cursor = null;

   // load skin — reowoTuna .osk is the default skin, sprites.json is fallback only
   window.Skin = window.Skin || {};
   window._defaultSkin = null;
    async function loadDefaultSkin() {
       // try cached .osk first (IndexedDB — instant after first load)
       try {
          const cached = await loadCachedSkin();
          if (cached) {
             ilog("initgame", "cached skin found", cached.config?.name || "unnamed", "textures", Object.keys(cached.textures||{}).length);
             await applySkin(cached);
             try { window._defaultSkin = { ...window.Skin }; } catch {}
             ilog("initgame", "cached skin applied");
             return true;
          }
       } catch (e) { iwarn("initgame", "loadCachedSkin failed", e); }
       // no cache — fetch the bundled default .osk and cache it
       try {
          ilog("initgame", "fetching default .osk from /skins/default.osk");
          const res = await fetch("/skins/default.osk");
          if (!res.ok) throw new Error("default.osk " + res.status);
          const blob = await res.blob();
          const { loadOsk, saveLocalSkin } = await import("./skin-loader.js");
          const data = await loadOsk(blob);
          ilog("initgame", "default .osk loaded", data.config?.name || "unnamed", "textures", Object.keys(data.textures||{}).length);
          try { await saveLocalSkin(data, "reowoTuna.osk"); } catch (e) { iwarn("initgame", "saveLocalSkin failed", e); }
          await applySkin(data);
          try { window._defaultSkin = { ...window.Skin }; } catch {}
          ilog("initgame", "default .osk applied");
          return true;
       } catch (e) { iwarn("initgame", "default .osk load failed, falling back to sprites.json", e); }
      // fallback: load sprites.json (legacy default spritesheet)
      try {
         const sheet = await PIXI.Assets.load("/sprites.json");
         window.Skin = sheet.textures;
         try { window._defaultSkin = { ...window.Skin }; } catch {}
         ilog("initgame", "sprites.json fallback loaded", Object.keys(window.Skin).length, "textures");
         return true;
      } catch (e) { ierror("initgame", "sprites.json also failed — game cannot start", e); return false; }
   }
    loadDefaultSkin().then((ok) => {
       window.skinReady = true;
       document.body.classList.add("skin-ready");
       ilog("initgame", "skinReady=true");
       // Validate skin after load
       try {
          const result = validateSkin(null); // reads from window.Skin
          if (!result.ok) {
             ilog("initgame", "skin validation issue", result);
             window.dispatchEvent(new CustomEvent("skin-health-issue", { detail: {
                type: "skin", missing: result.missing, corrupt: result.corrupt,
                message: result.missing.length ? "Missing core textures: " + result.missing.join(", ")
                  : "Corrupt textures: " + result.corrupt.join(", "),
             }}));
          }
       } catch (e) { iwarn("initgame", "skin validation failed", e); }
    });

   // load sounds
   // load hitsound set
    var sample = [
       "/hitsounds/normal-hitnormal.ogg",
       "/hitsounds/normal-hitwhistle.ogg",
       "/hitsounds/normal-hitfinish.ogg",
       "/hitsounds/normal-hitclap.ogg",
       "/hitsounds/normal-slidertick.ogg",
       "/hitsounds/soft-hitnormal.ogg",
       "/hitsounds/soft-hitwhistle.ogg",
       "/hitsounds/soft-hitfinish.ogg",
       "/hitsounds/soft-hitclap.ogg",
       "/hitsounds/soft-slidertick.ogg",
       "/hitsounds/drum-hitnormal.ogg",
       "/hitsounds/drum-hitwhistle.ogg",
       "/hitsounds/drum-hitfinish.ogg",
       "/hitsounds/drum-hitclap.ogg",
       "/hitsounds/drum-slidertick.ogg",
       "/hitsounds/combobreak.ogg",
   ];
   // override default hitsounds with any custom sounds the user imported (settings page)
   function applyCustomHitsounds() {
      const sn = window.gamesettings && window.gamesettings.soundNames;
      if (!sn || typeof sn !== "object") return;
      const slots = {
         "normal-hitnormal": [1, "hitnormal"],
         "normal-hitwhistle": [1, "hitwhistle"],
         "normal-hitfinish": [1, "hitfinish"],
         "normal-hitclap": [1, "hitclap"],
         "normal-slidertick": [1, "slidertick"],
         "soft-hitnormal": [2, "hitnormal"],
         "soft-hitwhistle": [2, "hitwhistle"],
         "soft-hitfinish": [2, "hitfinish"],
         "soft-hitclap": [2, "hitclap"],
         "soft-slidertick": [2, "slidertick"],
         "drum-hitnormal": [3, "hitnormal"],
         "drum-hitwhistle": [3, "hitwhistle"],
         "drum-hitfinish": [3, "hitfinish"],
         "drum-hitclap": [3, "hitclap"],
         "drum-slidertick": [3, "slidertick"],
         "combobreak": "combo",
      };
      for (const key in sn) {
         const slot = slots[key];
         if (slot === undefined) continue;
         const b64 = sn[key];
         if (!b64) continue;
         try {
            const bin = window.atob(b64);
            const buffer = new ArrayBuffer(bin.length);
            const view = new Uint8Array(buffer);
            for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
            const snd = makeSound(
               key,
               function () {
                  if (slot === "combo") window.game.sampleComboBreak = snd;
                  else window.game.sample[slot[0]][slot[1]] = snd;
               },
               false,
               { response: buffer },
               function (src, err) {
                  if (import.meta.env.DEV) console.warn("custom hitsound decode failed", src, err);
               }
            );
         } catch (e) {
            if (import.meta.env.DEV) console.warn("custom hitsound failed", key, e);
         }
      }
   }

    sounds.whenLoaded = function () {
       game.sample[1].hitnormal = sounds["/hitsounds/normal-hitnormal.ogg"];
       game.sample[1].hitwhistle = sounds["/hitsounds/normal-hitwhistle.ogg"];
       game.sample[1].hitfinish = sounds["/hitsounds/normal-hitfinish.ogg"];
       game.sample[1].hitclap = sounds["/hitsounds/normal-hitclap.ogg"];
       game.sample[1].slidertick = sounds["/hitsounds/normal-slidertick.ogg"];
       game.sample[1].sliderslide = sounds["/hitsounds/normal-sliderslide.ogg"];
       game.sample[1].spinnerspin = sounds["/hitsounds/normal-spinnerspin.ogg"];
       game.sample[2].hitnormal = sounds["/hitsounds/soft-hitnormal.ogg"];
       game.sample[2].hitwhistle = sounds["/hitsounds/soft-hitwhistle.ogg"];
       game.sample[2].hitfinish = sounds["/hitsounds/soft-hitfinish.ogg"];
       game.sample[2].hitclap = sounds["/hitsounds/soft-hitclap.ogg"];
       game.sample[2].slidertick = sounds["/hitsounds/soft-slidertick.ogg"];
       game.sample[2].sliderslide = sounds["/hitsounds/soft-sliderslide.ogg"];
       game.sample[2].spinnerspin = sounds["/hitsounds/soft-spinnerspin.ogg"];
       game.sample[3].hitnormal = sounds["/hitsounds/drum-hitnormal.ogg"];
       game.sample[3].hitwhistle = sounds["/hitsounds/drum-hitwhistle.ogg"];
       game.sample[3].hitfinish = sounds["/hitsounds/drum-hitfinish.ogg"];
       game.sample[3].hitclap = sounds["/hitsounds/drum-hitclap.ogg"];
       game.sample[3].slidertick = sounds["/hitsounds/drum-slidertick.ogg"];
       game.sample[3].sliderslide = sounds["/hitsounds/drum-sliderslide.ogg"];
       game.sample[3].spinnerspin = sounds["/hitsounds/drum-spinnerspin.ogg"];
       game.sampleComboBreak = sounds["/hitsounds/combobreak.ogg"];
       window.soundReady = true;
       applyCustomHitsounds();
       // Validate hitsounds after load
       try {
          const result = validateHitsounds();
          if (!result.ok) {
             iwarn("initgame", "hitsound validation issue", result);
             window.dispatchEvent(new CustomEvent("skin-health-issue", { detail: {
                type: "hitsounds", missing: result.missing,
                message: "Missing core hitsounds: " + result.missing.join(", "),
             }}));
          }
       } catch (e) { iwarn("initgame", "hitsound validation failed", e); }
    };
    sounds.load(sample);

   // resume the hitsound AudioContext on the first user gesture (autoplay policy)
   function resumeHitsoundContext() {
      if (window.actx && window.actx.state === "suspended") {
         window.actx.resume();
      }
   }
    window.addEventListener("pointerdown", resumeHitsoundContext, { once: true });
    window.addEventListener("keydown", resumeHitsoundContext, { once: true });

    // load script done
    window.scriptReady = true;

   // load play history
   if (window.localforage) {
      localforage.getItem("playhistory1000", function (err, item) {
         if (!err && item && item.length) {
            window.playHistory1000 = item;
         }
      });
   }

   // prevent all drag-related events
   window.addEventListener("drag", function (e) {
      e = e || window.event;
      e.preventDefault();
      e.stopPropagation();
   });
   window.addEventListener("dragend", function (e) {
      e = e || window.event;
      e.preventDefault();
      e.stopPropagation();
   });
   window.addEventListener("dragenter", function (e) {
      e = e || window.event;
      e.preventDefault();
      e.stopPropagation();
   });
   window.addEventListener("dragexit", function (e) {
      e = e || window.event;
      e.preventDefault();
      e.stopPropagation();
   });
   window.addEventListener("dragleave", function (e) {
      e = e || window.event;
      e.preventDefault();
      e.stopPropagation();
   });
   window.addEventListener("dragover", function (e) {
      e = e || window.event;
      e.preventDefault();
      e.stopPropagation();
   });
   window.addEventListener("dragstart", function (e) {
      e = e || window.event;
      e.preventDefault();
      e.stopPropagation();
   });
   window.addEventListener("drop", function (e) {
      e = e || window.event;
      e.preventDefault();
      e.stopPropagation();
   });
