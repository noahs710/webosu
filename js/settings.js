function setOptionPanel() {
   function loadFromLocal() {
      let str = window.localStorage.getItem("osugamesettings");
      if (str) {
         let s = JSON.parse(str);
         if (s) Object.assign(gamesettings, s);
      }
   }
   function saveToLocal() {
      window.localStorage.setItem(
         "osugamesettings",
         JSON.stringify(window.gamesettings)
      );
   }
   // Give inputs initial value; set their callback on change
   // Give range inputs a visual feedback (a hovering indicator that shows on drag)
   let defaultsettings = {
      dim: 60,
      blur: 0,
      cursorsize: 1.0,
      showhwmouse: false,
      snakein: true,
      snakeout: true,
      autofullscreen: false,
      sysdpi: true,
      dpiscale: 1.0,

      disableWheel: false,
      disableButton: false,
      K1name: "Z",
      K2name: "X",
      Kpausename: "SPACE",
      Kpause2name: "ESC",
      Kskipname: "CTRL",
      K1keycode: 90,
      K2keycode: 88,
      Kpausekeycode: 32,
      Kpause2keycode: 27,
      Kskipkeycode: 17,

      mastervolume: 35,
      effectvolume: 100,
      musicvolume: 50,
      audiooffset: 0,
      beatmapHitsound: true,

      easy: false,
      daycore: false,
      hardrock: false,
      nightcore: false,
      hidden: false,
      autoplay: false,

      hideNumbers: false,
      hideGreat: true,
      hideFollowPoints: false,
      soundNames: undefined,
   };
   window.gamesettings = {};
   Object.assign(gamesettings, defaultsettings);
   gamesettings.refresh = loadFromLocal;
   loadFromLocal();

   window.gamesettings.loadToGame = function () {
      if (window.game) {
         window.game.backgroundDimRate = this.dim / 100;
         window.game.backgroundBlurRate = this.blur / 100;
         window.game.cursorSize = parseFloat(this.cursorsize);
         window.game.showhwmouse = this.showhwmouse;
         window.game.snakein = this.snakein;
         window.game.snakeout = this.snakeout;
         window.game.autofullscreen = this.autofullscreen;
         window.game.overridedpi = !this.sysdpi;
         window.game.dpiscale = this.dpiscale;

         window.game.allowMouseScroll = !this.disableWheel;
         window.game.allowMouseButton = !this.disableButton;
         window.game.K1keycode = this.K1keycode;
         window.game.K2keycode = this.K2keycode;
         window.game.ESCkeycode = this.Kpausekeycode;
         window.game.ESC2keycode = this.Kpause2keycode;
         window.game.CTRLkeycode = this.Kskipkeycode;

         window.game.masterVolume = this.mastervolume / 100;
         window.game.effectVolume = this.effectvolume / 100;
         window.game.musicVolume = this.musicvolume / 100;
         window.game.beatmapHitsound = this.beatmapHitsound;
         window.game.globalOffset = parseFloat(this.audiooffset);

         window.game.easy = this.easy;
         window.game.daycore = this.daycore;
         window.game.hardrock = this.hardrock;
         window.game.nightcore = this.nightcore;
         window.game.hidden = this.hidden;
         window.game.autoplay = this.autoplay;

         window.game.hideNumbers = this.hideNumbers;
         window.game.hideGreat = this.hideGreat;
         window.game.hideFollowPoints = this.hideFollowPoints;
         soundNames: undefined;
      }
   };
   gamesettings.loadToGame();
   // this will also be called on game side. The latter call makes effect
   if (!document.getElementById("settings-panel")) return;

   // functions that get called when settings are restored to default
   // used for refreshing widgets on the page
   gamesettings.restoreCallbacks = [];
   function checkdefault(element, item) {
      if (gamesettings[item] == defaultsettings[item])
         element.parentElement.parentElement.parentElement.classList.remove(
            "non-default"
         );
      else
         element.parentElement.parentElement.parentElement.classList.add(
            "non-default"
         );
   }
   // FIXME: checkdefault: 1 to 1 bind
   function bindcheck(id, item) {
      let c = document.getElementById(id);
      c.checked = gamesettings[item];
      gamesettings.restoreCallbacks.push(function () {
         c.checked = gamesettings[item];
         checkdefault(c, item);
      });
      checkdefault(c, item);
      c.onclick = function () {
         gamesettings[item] = c.checked;
         checkdefault(c, item);
         gamesettings.loadToGame();
         saveToLocal();
      };
   }

   function bindExclusiveCheck(id1, item1, id2, item2) {
      let c1 = document.getElementById(id1);
      let c2 = document.getElementById(id2);
      c1.checked = gamesettings[item1];
      c2.checked = gamesettings[item2];
      gamesettings.restoreCallbacks.push(function () {
         c1.checked = gamesettings[item1];
         c2.checked = gamesettings[item2];
         checkdefault(c1, item1);
         checkdefault(c2, item2);
      });
      checkdefault(c1, item1);
      checkdefault(c2, item2);
      c1.onclick = function () {
         gamesettings[item1] = c1.checked;
         gamesettings[item2] = false;
         c2.checked = false;
         gamesettings.loadToGame();
         saveToLocal();
         checkdefault(c1, item1);
         checkdefault(c2, item2);
      };
      c2.onclick = function () {
         gamesettings[item2] = c2.checked;
         gamesettings[item1] = false;
         c1.checked = false;
         gamesettings.loadToGame();
         saveToLocal();
         checkdefault(c1, item1);
         checkdefault(c2, item2);
      };
   }

   function bindrange(id, item, feedback) {
      let range = document.getElementById(id);
      let indicator = document.getElementById(id + "-indicator");
      range.onmousedown = function () {
         indicator.removeAttribute("hidden");
      };
      range.onmouseup = function () {
         indicator.setAttribute("hidden", "");
      };
      range.oninput = function () {
         let min = parseFloat(range.min);
         let max = parseFloat(range.max);
         let val = parseFloat(range.value);
         let pos = (val - min) / (max - min);
         let length = range.clientWidth - 20;
         indicator.style.left = pos * length + 13 + "px";
         indicator.innerText = feedback(val);
         gamesettings[item] = range.value;
         checkdefault(range, item);
      };
      range.value = gamesettings[item];
      gamesettings.restoreCallbacks.push(function () {
         range.value = gamesettings[item];
         checkdefault(range, item);
      });
      range.oninput();
      range.onchange = function () {
         gamesettings[item] = range.value;
         gamesettings.loadToGame();
         saveToLocal();
         checkdefault(range, item);
      };
   }

   function arrayBufferToBase64(buffer) {
      var binary = "";
      var bytes = new Uint8Array(buffer);
      var len = bytes.byteLength;
      for (var i = 0; i < len; i++) {
         binary += String.fromCharCode(bytes[i]);
      }
      return window.btoa(binary);
   }

   function bindkeyselector(id, keynameitem, keycodeitem) {
      let btn = document.getElementById(id);
      let activate = function () {
         let t_onkeydown = window.onkeydown;
         window.onkeydown = null;
         let deactivate = function () {
            window.onkeydown = t_onkeydown;
            btn.onclick = activate;
            btn.classList.remove("using");
            document.removeEventListener("keydown", listenkey);
            checkdefault(btn, keynameitem);
         };
         let listenkey = function (e) {
            e = e || window.event;
            e.stopPropagation();
            gamesettings[keycodeitem] = e.keyCode;
            gamesettings[keynameitem] = e.key.toUpperCase();
            if (gamesettings[keynameitem] == " ")
               gamesettings[keynameitem] = "SPACE";
            if (gamesettings[keynameitem] == "ESCAPE")
               gamesettings[keynameitem] = "ESC";
            if (gamesettings[keynameitem] == "CONTROL")
               gamesettings[keynameitem] = "CTRL";
            btn.value = gamesettings[keynameitem];
            gamesettings.loadToGame();
            saveToLocal();
            deactivate();
         };
         btn.classList.add("using");
         document.addEventListener("keydown", listenkey);
         btn.onclick = deactivate;
      };
      checkdefault(btn, keynameitem);
      btn.onclick = activate;
      btn.value = gamesettings[keynameitem];
      gamesettings.restoreCallbacks.push(function () {
         btn.value = gamesettings[keynameitem];
         checkdefault(btn, keynameitem);
      });
   }
   function soundCheck(id) {
      const input = document.getElementById(id);
      const dropzone = document.getElementById("oskdrop");
      const statusEl = document.getElementById("oskstatus");
      const hitsoundNames = [
         "normal-hitnormal",
         "normal-hitwhistle",
         "normal-hitfinish",
         "normal-hitclap",
         "normal-slidertick",
         "soft-hitnormal",
         "soft-hitwhistle",
         "soft-hitfinish",
         "soft-hitclap",
         "soft-slidertick",
         "drum-hitnormal",
         "drum-hitwhistle",
         "drum-hitfinish",
         "drum-hitclap",
         "drum-slidertick",
         "combobreak",
      ];
      // osu! skin hitsounds may be .wav or .ogg; match by name without extension
      function canonicalName(filename) {
         const base = filename
            .split("/")
            .pop()
            .replace(/\.[^.]+$/, "")
            .toLowerCase();
         return hitsoundNames.indexOf(base) !== -1 ? base : null;
      }
      function setStatus(text, ok) {
         if (statusEl) {
            statusEl.textContent = text;
            statusEl.classList.toggle("ok", !!ok);
         }
      }
      function storeHitsounds(map) {
         const keys = Object.keys(map);
         if (keys.length) {
            const existing =
               gamesettings["soundNames"] &&
               typeof gamesettings["soundNames"] === "object"
                  ? gamesettings["soundNames"]
                  : {};
            gamesettings["soundNames"] = Object.assign({}, existing, map);
         }
         gamesettings.loadToGame();
         saveToLocal();
         return keys.length;
      }
      function storeSkin(skin) {
         const keys = Object.keys(skin);
         if (!keys.length || !window.localforage) return 0;
         localforage.getItem("skinTextures", function (err, existing) {
            const base =
               existing && typeof existing === "object" ? existing : {};
            localforage.setItem(
               "skinTextures",
               Object.assign({}, base, skin)
            );
         });
         return keys.length;
      }
      // extract hitsounds + skin images from a .osk (zip) via the bundled zip.js
      function importOsk(file) {
         if (!window.zip) {
            return Promise.reject(new Error("zip library not loaded"));
         }
         if (!zip.workerScriptsPath) zip.workerScriptsPath = "js/lib/";
         function isImage(name) {
            return /\.(png|jpe?g)$/i.test(name);
         }
         return new Promise(function (resolve, reject) {
            const zfs = new zip.fs.FS();
            zfs.root.importBlob(
               file,
               function () {
                  const hits = [];
                  const imgs = [];
                  (function walk(entry) {
                     if (typeof entry.getBlob === "function") {
                        const cn = canonicalName(entry.name);
                        if (cn) {
                           hits.push({ entry: entry, name: cn });
                        } else {
                           const base = entry.name
                              .split("/")
                              .pop()
                              .toLowerCase();
                           if (isImage(base))
                              imgs.push({ entry: entry, name: base });
                        }
                        return;
                     }
                     const kids = entry.children || [];
                     for (let i = 0; i < kids.length; i++) walk(kids[i]);
                  })(zfs.root);
                  const out = { hitsounds: {}, skin: {} };
                  const all = hits
                     .map(function (m) {
                        return { m: m, into: "hitsounds" };
                     })
                     .concat(
                        imgs.map(function (m) {
                           return { m: m, into: "skin" };
                        })
                     );
                  if (!all.length) {
                     resolve(out);
                     return;
                  }
                  let pending = all.length;
                  all.forEach(function (item) {
                     item.m.entry.getBlob(
                        "application/octet-stream",
                        function (blob) {
                           blob.arrayBuffer()
                              .then(function (ab) {
                                 out[item.into][item.m.name] =
                                    arrayBufferToBase64(ab);
                              })
                              .catch(function (err) {
                                 console.error(
                                    "extract failed",
                                    item.m.name,
                                    err
                                 );
                              })
                              .finally(function () {
                                 if (--pending === 0) resolve(out);
                              });
                        }
                     );
                  });
               },
               function (err) {
                  reject(err);
               }
            );
         });
      }
      async function handleFiles(files) {
         const hitsounds = {};
         const skin = {};
         for (const f of files) {
            if (f.name.toLowerCase().endsWith(".osk")) {
               try {
                  const r = await importOsk(f);
                  Object.assign(hitsounds, r.hitsounds || {});
                  Object.assign(skin, r.skin || {});
               } catch (e) {
                  console.error(e);
                  setStatus("Failed to read .osk: " + (e.message || e));
                  return;
               }
            } else {
               const cn = canonicalName(f.name);
               if (cn) {
                  try {
                     hitsounds[cn] = arrayBufferToBase64(
                        await f.arrayBuffer()
                     );
                  } catch (e) {
                     console.error("hitsound import failed", f.name, e);
                  }
               } else {
                  const base = f.name.split("/").pop().toLowerCase();
                  if (/\.(png|jpe?g)$/i.test(base)) {
                     try {
                        skin[base] = arrayBufferToBase64(
                           await f.arrayBuffer()
                        );
                     } catch (e) {
                        console.error("skin import failed", f.name, e);
                     }
                  }
               }
            }
         }
         const h = storeHitsounds(hitsounds);
         const sk = storeSkin(skin);
         if (h || sk) {
            setStatus(
               "Loaded " +
                  h +
                  " hitsound" +
                  (h === 1 ? "" : "s") +
                  (sk
                     ? " and " + sk + " skin image" + (sk === 1 ? "" : "s")
                     : ""),
               true
            );
         } else {
            setStatus("No hitsounds or skin images found in that file.");
         }
      }
      input.onchange = async function () {
         const files = Array.from(input.files);
         input.value = "";
         if (!files.length) return;
         setStatus("Processing...");
         await handleFiles(files);
      };
      if (dropzone) {
         dropzone.addEventListener("dragover", function (e) {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.add("drag");
         });
         dropzone.addEventListener("dragleave", function (e) {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove("drag");
         });
         dropzone.addEventListener("drop", function (e) {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove("drag");
            const files = e.dataTransfer ? Array.from(e.dataTransfer.files) : [];
            if (!files.length) return;
            setStatus("Processing...");
            handleFiles(files);
         });
      }
      gamesettings.restoreCallbacks.push(function () {
         gamesettings["soundNames"] = undefined;
         if (statusEl) statusEl.textContent = "";
         if (window.localforage) localforage.removeItem("skinTextures");
      });
   }
   // gameplay settings
   bindrange("dim-range", "dim", function (v) {
      return v + "%";
   });
   bindrange("blur-range", "blur", function (v) {
      return v + "%";
   });
   bindrange("cursorsize-range", "cursorsize", function (v) {
      return v.toFixed(2) + "x";
   });
   bindcheck("showhwmouse-check", "showhwmouse");
   bindcheck("snakein-check", "snakein");
   bindcheck("snakeout-check", "snakeout");
   bindcheck("autofullscreen-check", "autofullscreen");
   bindcheck("sysdpi-check", "sysdpi");
   bindrange("dpi-range", "dpiscale", function (v) {
      return v.toFixed(2) + "x";
   });

   // input settings
   bindcheck("disable-wheel-check", "disableWheel");
   bindcheck("disable-button-check", "disableButton");
   bindkeyselector("lbutton1select", "K1name", "K1keycode");
   bindkeyselector("rbutton1select", "K2name", "K2keycode");
   bindkeyselector("pausebutton2select", "Kpause2name", "Kpause2keycode");
   bindkeyselector("pausebuttonselect", "Kpausename", "Kpausekeycode");
   bindkeyselector("skipbuttonselect", "Kskipname", "Kskipkeycode");

   // audio settings
   bindrange("mastervolume-range", "mastervolume", function (v) {
      return v + "%";
   });
   bindrange("effectvolume-range", "effectvolume", function (v) {
      return v + "%";
   });
   bindrange("musicvolume-range", "musicvolume", function (v) {
      return v + "%";
   });
   bindrange("audiooffset-range", "audiooffset", function (v) {
      return v + "ms";
   });
   bindcheck("beatmap-hitsound-check", "beatmapHitsound");
   soundCheck("skinhitsound");

   // mods
   bindExclusiveCheck("easy-check", "easy", "hardrock-check", "hardrock");
   bindExclusiveCheck(
      "daycore-check",
      "daycore",
      "nightcore-check",
      "nightcore"
   );
   bindcheck("hidden-check", "hidden");
   bindcheck("autoplay-check", "autoplay");

   // skin
   bindcheck("hidenumbers-check", "hideNumbers");
   bindcheck("hidegreat-check", "hideGreat");
   bindcheck("hidefollowpoints-check", "hideFollowPoints");

   document.getElementById("restoredefault-btn").onclick = function() {
      Object.assign(gamesettings, defaultsettings);
      for (let i = 0; i < gamesettings.restoreCallbacks.length; ++i)
         gamesettings.restoreCallbacks[i]();
      gamesettings.loadToGame();
      saveToLocal();
   };
   document.getElementById("export-btn").onclick = function() {
      let modified = {};
      Object.keys(gamesettings).forEach(k => {
         if (!['object','function'].includes(typeof gamesettings[k])) modified[k] = gamesettings[k];
      });
      let element = document.createElement('a');
      element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(JSON.stringify(modified, null, 2)));
      element.setAttribute('download', 'webosu-settings.json');
      element.style.display = 'none';
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
   };
   document.getElementById("import-btn").onclick = function() {
      document.getElementById('file-import').click();
   };
   document.getElementById("file-import").onchange = function(event) {
      let file = event.target.files[0];
      event.target.value = '';
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
         try {
            let data = JSON.parse(evt.target.result);
            Object.keys(data).forEach(k => gamesettings[k] = data[k])
            gamesettings.loadToGame();
            saveToLocal();
         } catch (err) {
            alert('Could not parse file')
         }
      };
      reader.onerror = () => {
         alert('Could not load file')
      };
      reader.readAsText(file);
   };
}

window.addEventListener("DOMContentLoaded", setOptionPanel);
