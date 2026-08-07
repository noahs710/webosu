require(["osu", "underscore", "sound", "playback"], function (
   Osu,
   _,
   sound,
   Playback
) {
   window.Osu = Osu;
   window.Playback = Playback;
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

      // mods
      autoplay: false,
      nightcore: false,
      daycore: false,
      hardrock: false,
      easy: false,
      hidden: false,

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
   if (window.gamesettings) window.gamesettings.loadToGame();
   window.skinReady = false;
   window.soundReady = false;
   window.scriptReady = false;
   game.stage = new PIXI.Container();
   game.cursor = null;

   // load skin & game cursor
   PIXI.Loader.shared
      .add("sprites.json")
      .load(function (loader, resources) {
         Skin = PIXI.Loader.shared.resources["sprites.json"].textures;
         // apply any custom skin textures, then signal skin ready
         applyCustomSkin(function () {
            window.skinReady = true;
            document.getElementById("skin-progress").classList.add("finished");
            document.body.classList.add("skin-ready");
         });
      });

   // load sounds
   // load hitsound set
   var sample = [
      "hitsounds/normal-hitnormal.ogg",
      "hitsounds/normal-hitwhistle.ogg",
      "hitsounds/normal-hitfinish.ogg",
      "hitsounds/normal-hitclap.ogg",
      "hitsounds/normal-slidertick.ogg",
      "hitsounds/soft-hitnormal.ogg",
      "hitsounds/soft-hitwhistle.ogg",
      "hitsounds/soft-hitfinish.ogg",
      "hitsounds/soft-hitclap.ogg",
      "hitsounds/soft-slidertick.ogg",
      "hitsounds/drum-hitnormal.ogg",
      "hitsounds/drum-hitwhistle.ogg",
      "hitsounds/drum-hitfinish.ogg",
      "hitsounds/drum-hitclap.ogg",
      "hitsounds/drum-slidertick.ogg",
      "hitsounds/combobreak.ogg",
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
                  console.warn("custom hitsound decode failed", src, err);
               }
            );
         } catch (e) {
            console.warn("custom hitsound failed", key, e);
         }
      }
   }

   // apply custom skin textures imported from a .osk (stored in localforage)
   function applyCustomSkin(done) {
      // map osu! skin filenames that differ from the webosu spritesheet keys
      var skinNameMap = {
         "hitcircle.png": "disc.png",
         "sliderb0.png": "sliderb.png",
      };
      if (!window.localforage) {
         done();
         return;
      }
      localforage.getItem("skinTextures", function (err, map) {
         if (err || !map || typeof map !== "object") {
            done();
            return;
         }
         for (var osuName in map) {
            try {
               var key = skinNameMap[osuName] || osuName;
               if (Skin[key]) {
                  Skin[key] = PIXI.Texture.from(
                     "data:image/png;base64," + map[osuName]
                  );
               }
            } catch (e) {
               console.warn("custom skin apply failed", osuName, e);
            }
         }
         done();
      });
   }

   sounds.whenLoaded = function () {
      game.sample[1].hitnormal = sounds["hitsounds/normal-hitnormal.ogg"];
      game.sample[1].hitwhistle = sounds["hitsounds/normal-hitwhistle.ogg"];
      game.sample[1].hitfinish = sounds["hitsounds/normal-hitfinish.ogg"];
      game.sample[1].hitclap = sounds["hitsounds/normal-hitclap.ogg"];
      game.sample[1].slidertick = sounds["hitsounds/normal-slidertick.ogg"];
      game.sample[2].hitnormal = sounds["hitsounds/soft-hitnormal.ogg"];
      game.sample[2].hitwhistle = sounds["hitsounds/soft-hitwhistle.ogg"];
      game.sample[2].hitfinish = sounds["hitsounds/soft-hitfinish.ogg"];
      game.sample[2].hitclap = sounds["hitsounds/soft-hitclap.ogg"];
      game.sample[2].slidertick = sounds["hitsounds/soft-slidertick.ogg"];
      game.sample[3].hitnormal = sounds["hitsounds/drum-hitnormal.ogg"];
      game.sample[3].hitwhistle = sounds["hitsounds/drum-hitwhistle.ogg"];
      game.sample[3].hitfinish = sounds["hitsounds/drum-hitfinish.ogg"];
      game.sample[3].hitclap = sounds["hitsounds/drum-hitclap.ogg"];
      game.sample[3].slidertick = sounds["hitsounds/drum-slidertick.ogg"];
      game.sampleComboBreak = sounds["hitsounds/combobreak.ogg"];
      window.soundReady = true;
      document.getElementById("sound-progress").classList.add("finished");
      document.body.classList.add("sound-ready");
      applyCustomHitsounds();
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

   PIXI.Sprite.prototype.bringToFront = function () {
      if (this.parent) {
         var parent = this.parent;
         parent.removeChild(this);
         parent.addChild(this);
      }
   };

   // load script done
   window.scriptReady = true;
   document.getElementById("script-progress").classList.add("finished");
   document.body.classList.add("script-ready");

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
});
