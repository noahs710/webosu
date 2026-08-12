// Phase 3: ESM gamesettings system (shared between the settings page and the game).
import { api } from "./api.js";
import GameState from "./gamestate.js";
// Ports the core of classic settings.js: defaults + loadToGame (settings -> GameState -> window.game)
// + localStorage ("osugamesettings") + optional backend sync via WebosuAPI. Sets
// window.gamesettings so the ESM game (initgame) applies user settings on launch.
const defaultsettings = {
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
   doubletime: false,
   hidden: false,
   autoplay: false,
   hideNumbers: false,
   hideGreat: true,
   hideFollowPoints: false,
   showTapIndicator: true,
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
   flashlight: false,
   // New lazer mods (driven by ModSelectPanel -> ModRegistry)
   relax: false,
   autopilot: false,
   targetpractice: false,
   adaptiveSpeed: false,
   magnetised: false,
   wobble: false,
   windup: false,
   traceable: false,
   approachDifferent: false,
   bubbles: false,
   repel: false,
   depth: false,
   transform: false,
   noscope: false,
   // Mod customization settings (sliders in the ModSelectPanel)
   flSize0: 400,
   flSize200: 250,
   tpSize: 1.0,
   asMaxRate: 1.05,
   tfRotate: 0,
   soundNames: undefined,
};

// DT/NC settings migration: old settings have nightcore=true meaning "1.5x + pitch" (= NC).
// New settings split this into doubletime (1.5x speed) + nightcore (NC pitch on top of DT).
// NC implies DT, so old nightcore=true -> doubletime=true + nightcore=true.
function migrateSettings(str) {
   try {
      const s = JSON.parse(str);
      if (
         s &&
         typeof s === "object" &&
         s.nightcore === true &&
         s.doubletime === undefined
      ) {
         s.doubletime = true; // NC implies DT
         // nightcore stays true (the NC pitch shift is still active)
         return JSON.stringify(s);
      }
   } catch (e) {}
   return str;
}

const gamesettings = {};
Object.assign(gamesettings, defaultsettings);
gamesettings.restoreCallbacks = [];

function loadFromLocal() {
   try {
      let str = localStorage.getItem("osugamesettings");
      if (str) {
         str = migrateSettings(str); // DT/NC split migration (forward-only)
         const s = JSON.parse(str);
         if (s && typeof s === "object") {
            for (const k in s) if (k in defaultsettings) gamesettings[k] = s[k];
         }
      }
   } catch (e) {}
}
let serverSyncTimer = null;
function pushToServer() {
   if (!api.isLoggedIn()) return;
   if (serverSyncTimer) clearTimeout(serverSyncTimer);
   serverSyncTimer = setTimeout(() => {
      try {
         const s = {};
         for (const k in defaultsettings) s[k] = gamesettings[k];
         const fav = window.liked_sid_set
            ? Array.from(window.liked_sid_set)
            : [];
         api.saveMyProfile({ settings: s, favorites: fav }).catch(() => {});
      } catch (e) {}
   }, 800);
}
function saveToLocal() {
   try {
      localStorage.setItem("osugamesettings", JSON.stringify(gamesettings));
   } catch (e) {}
   pushToServer();
}
async function syncFromServer() {
   if (!api.isLoggedIn()) return;
   // Don't overwrite local changes that are still pending push to server
   if (serverSyncTimer) return;
   try {
      const p = await api.getMyProfile();
      if (p && p.settings) {
         // Only apply server settings for keys that are still at default locally
         // to avoid overwriting just-changed mods (race: push is 800ms debounced, sync is immediate on mount)
         const localRaw = (() => {
            try {
               return JSON.parse(
                  localStorage.getItem("osugamesettings") || "{}",
               );
            } catch {
               return {};
            }
         })();
         for (const k in p.settings) {
            if (!(k in defaultsettings)) continue;
            // if local has a non-default value that differs from server, keep local (user just changed it)
            const localVal =
               localRaw[k] !== undefined ? localRaw[k] : gamesettings[k];
            const serverVal = p.settings[k];
            // if local is non-default and server is default, keep local
            if (
               localVal !== defaultsettings[k] &&
               serverVal === defaultsettings[k]
            )
               continue;
            // if local differs from server and local was recently saved (within 5s), keep local
            // we use the presence of serverSyncTimer as signal, but also check direct value diff
            if (
               localVal !== serverVal &&
               JSON.stringify(localVal) !== JSON.stringify(serverVal)
            ) {
               // if local is not default, prefer local to avoid clobbering just-toggled mod
               if (localVal !== defaultsettings[k]) continue;
            }
            gamesettings[k] = serverVal;
         }
         gamesettings.loadToGame();
         for (const c of gamesettings.restoreCallbacks)
            try {
               c();
            } catch (e) {}
      }
   } catch (e) {}
}

gamesettings.loadToGame = function () {
   if (!window.game) return;
   GameState.bind(window.game);
   // Push all current gamesettings into GameState using the raw gamesettings keys.
   // GameState normalizes values when writing to the runtime window.game object.
   GameState.setBatch({
      "display.dim": this.dim,
      "display.blur": this.blur,
      "display.cursorsize": this.cursorsize,
      "display.showhwmouse": this.showhwmouse,
      "display.snakein": this.snakein,
      "display.snakeout": this.snakeout,
      "display.autofullscreen": this.autofullscreen,
      "display.sysdpi": this.sysdpi,
      "display.dpiscale": this.dpiscale,
      "display.hideNumbers": this.hideNumbers,
      "display.hideGreat": this.hideGreat,
      "display.hideFollowPoints": this.hideFollowPoints,
      "audio.mastervolume": this.mastervolume,
      "audio.effectvolume": this.effectvolume,
      "audio.musicvolume": this.musicvolume,
      "audio.audiooffset": this.audiooffset,
      "audio.beatmapHitsound": this.beatmapHitsound,
      "input.disableWheel": this.disableWheel,
      "input.disableButton": this.disableButton,
      "input.K1name": this.K1name,
      "input.K2name": this.K2name,
      "input.Kpausename": this.Kpausename,
      "input.Kpause2name": this.Kpause2name,
      "input.Kskipname": this.Kskipname,
      "input.K1keycode": this.K1keycode,
      "input.K2keycode": this.K2keycode,
      "input.Kpausekeycode": this.Kpausekeycode,
      "input.Kpause2keycode": this.Kpause2keycode,
      "input.Kskipkeycode": this.Kskipkeycode,
      "settings.flSize0": this.flSize0,
      "settings.flSize200": this.flSize200,
      "settings.tpSize": this.tpSize,
      "settings.asMaxRate": this.asMaxRate,
      "settings.tfRotate": this.tfRotate,
      "mods.hardrock": this.hardrock,
      "mods.easy": this.easy,
      "mods.doubletime": this.doubletime,
      "mods.nightcore": this.nightcore,
      "mods.daycore": this.daycore,
      "mods.hidden": this.hidden,
      "mods.autoplay": this.autoplay,
      "mods.nofail": this.nofail,
      "mods.suddendeath": this.suddendeath,
      "mods.perfect": this.perfect,
      "mods.spunout": this.spunout,
      "mods.classic": this.classic,
      "mods.flashlight": this.flashlight,
      "mods.relax": this.relax,
      "mods.autopilot": this.autopilot,
      "mods.targetpractice": this.targetpractice,
      "mods.adaptiveSpeed": this.adaptiveSpeed,
      "mods.magnetised": this.magnetised,
      "mods.wobble": this.wobble,
      "mods.windup": this.windup,
      "mods.traceable": this.traceable,
      "mods.approachDifferent": this.approachDifferent,
      "mods.bubbles": this.bubbles,
      "mods.repel": this.repel,
      "mods.depth": this.depth,
      "mods.transform": this.transform,
      "mods.noscope": this.noscope,
      "mods.difficultyAdjust": this.difficultyAdjust,
      "mods.customAR": this.customAR,
      "mods.customCS": this.customCS,
      "mods.customOD": this.customOD,
      "mods.customHP": this.customHP,
   });
   GameState.syncLegacy();
};
gamesettings.refresh = loadFromLocal;
gamesettings.save = saveToLocal;
gamesettings.syncFromServer = syncFromServer;

loadFromLocal();
window.gamesettings = gamesettings;
// if game already exists (initgame loaded first), push settings immediately
try {
   if (window.game) gamesettings.loadToGame();
} catch {}

// Sync server-side mods when the user logs in (mods are per-user, not device).
if (typeof window !== "undefined") {
   window.addEventListener("webosu-auth", () => {
      if (api.isLoggedIn()) syncFromServer();
   });
}

export {
   gamesettings,
   defaultsettings,
   saveToLocal,
   loadFromLocal,
   syncFromServer,
};
export default gamesettings;
