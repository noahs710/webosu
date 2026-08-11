// Phase 3: ESM gamesettings system (shared between the settings page and the game).
import { api } from "./api.js";
// Ports the core of classic settings.js: defaults + loadToGame (settings -> window.game)
// + localStorage ("osugamesettings") + optional backend sync via WebosuAPI. Sets
// window.gamesettings so the ESM game (initgame) applies user settings on launch.
const defaultsettings = {
  dim: 60, blur: 0, cursorsize: 1.0, showhwmouse: false, snakein: true, snakeout: true,
  autofullscreen: false, sysdpi: true, dpiscale: 1.0,
  disableWheel: false, disableButton: false,
  K1name: "Z", K2name: "X", Kpausename: "SPACE", Kpause2name: "ESC", Kskipname: "CTRL",
  K1keycode: 90, K2keycode: 88, Kpausekeycode: 32, Kpause2keycode: 27, Kskipkeycode: 17,
  mastervolume: 35, effectvolume: 100, musicvolume: 50, audiooffset: 0, beatmapHitsound: true,
  easy: false, daycore: false, hardrock: false, nightcore: false, doubletime: false, hidden: false, autoplay: false,
  hideNumbers: false, hideGreat: true, hideFollowPoints: false,
  nofail: false, suddendeath: false, perfect: false, spunout: false, classic: false,
  difficultyAdjust: false, customAR: 0, customCS: 0, customOD: 0, customHP: 0,
  flashlight: false,
  // New lazer mods (driven by ModSelectPanel → ModRegistry)
  relax: false, autopilot: false, targetpractice: false, adaptiveSpeed: false,
  magnetised: false, wobble: false, windup: false, traceable: false,
  approachDifferent: false, bubbles: false, repel: false, depth: false,
  transform: false, noscope: false,
  // Mod customization settings (sliders in the ModSelectPanel)
  flSize0: 400, flSize200: 250, tpSize: 1.0, asMaxRate: 1.05, tfRotate: 0,
  soundNames: undefined,
};

// DT/NC settings migration: old settings have nightcore=true meaning "1.5x + pitch" (= NC).
// New settings split this into doubletime (1.5x speed) + nightcore (NC pitch on top of DT).
// NC implies DT, so old nightcore=true → doubletime=true + nightcore=true.
function migrateSettings(str) {
  try {
    const s = JSON.parse(str);
    if (s && typeof s === "object" && s.nightcore === true && s.doubletime === undefined) {
      s.doubletime = true;  // NC implies DT
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
      str = migrateSettings(str);  // DT/NC split migration (forward-only)
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
      const s = {}; for (const k in defaultsettings) s[k] = gamesettings[k];
      const fav = window.liked_sid_set ? Array.from(window.liked_sid_set) : [];
      api.saveMyProfile({ settings: s, favorites: fav }).catch(() => {});
    } catch (e) {}
  }, 800);
}
function saveToLocal() {
  try { localStorage.setItem("osugamesettings", JSON.stringify(gamesettings)); } catch (e) {}
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
      const localRaw = (() => { try { return JSON.parse(localStorage.getItem("osugamesettings") || "{}"); } catch { return {}; }})();
      for (const k in p.settings) {
        if (!(k in defaultsettings)) continue;
        // if local has a non-default value that differs from server, keep local (user just changed it)
        const localVal = localRaw[k] !== undefined ? localRaw[k] : gamesettings[k];
        const serverVal = p.settings[k];
        // if local is non-default and server is default, keep local
        if (localVal !== defaultsettings[k] && serverVal === defaultsettings[k]) continue;
        // if local differs from server and local was recently saved (within 5s), keep local
        // we use the presence of serverSyncTimer as signal, but also check direct value diff
        if (localVal !== serverVal && JSON.stringify(localVal) !== JSON.stringify(serverVal)) {
          // if local is not default, prefer local to avoid clobbering just-toggled mod
          if (localVal !== defaultsettings[k]) continue;
        }
        gamesettings[k] = serverVal;
      }
      gamesettings.loadToGame();
      for (const c of gamesettings.restoreCallbacks) try { c(); } catch (e) {}
    }
  } catch (e) {}
}

gamesettings.loadToGame = function () {
  if (!window.game) return;
  const g = window.game;
  g.backgroundDimRate = this.dim / 100;
  g.backgroundBlurRate = this.blur / 100;
  g.cursorSize = parseFloat(this.cursorsize);
  g.showhwmouse = this.showhwmouse;
  g.snakein = this.snakein; g.snakeout = this.snakeout;
  g.autofullscreen = this.autofullscreen;
  g.overridedpi = !this.sysdpi; g.dpiscale = this.dpiscale;
  g.allowMouseScroll = !this.disableWheel; g.allowMouseButton = !this.disableButton;
  g.K1keycode = this.K1keycode; g.K2keycode = this.K2keycode;
  g.ESCkeycode = this.Kpausekeycode; g.ESC2keycode = this.Kpause2keycode; g.CTRLkeycode = this.Kskipkeycode;
  g.masterVolume = this.mastervolume / 100; g.effectVolume = this.effectvolume / 100; g.musicVolume = this.musicvolume / 100;
  g.beatmapHitsound = this.beatmapHitsound; g.globalOffset = parseFloat(this.audiooffset);
  g.easy = this.easy; g.daycore = this.daycore; g.hardrock = this.hardrock; g.nightcore = this.nightcore;
  g.hidden = this.hidden; g.autoplay = this.autoplay;
  g.nofail = this.nofail; g.suddendeath = this.suddendeath; g.perfect = this.perfect; g.spunout = this.spunout;
  g.classic = this.classic; g.difficultyAdjust = this.difficultyAdjust;
  g.customAR = parseFloat(this.customAR); g.customCS = parseFloat(this.customCS);
  g.customOD = parseFloat(this.customOD); g.customHP = parseFloat(this.customHP);
  g.hideNumbers = this.hideNumbers; g.hideGreat = this.hideGreat; g.hideFollowPoints = this.hideFollowPoints;
  g.flashlight = this.flashlight;
  // New lazer mod flags
  g.relax = this.relax; g.autopilot = this.autopilot; g.targetpractice = this.targetpractice;
  g.adaptiveSpeed = this.adaptiveSpeed; g.magnetised = this.magnetised; g.wobble = this.wobble;
  g.windup = this.windup; g.traceable = this.traceable; g.approachDifferent = this.approachDifferent;
  g.bubbles = this.bubbles; g.repel = this.repel; g.depth = this.depth;
  g.transform = this.transform; g.noscope = this.noscope;

  // Build the ModRegistry active set from the flat flags (migration bridge).
  // The new mod-select UI (Task 13) will eventually drive this directly with
  // a mod-spec list + per-mod settings; until then, the flat flags are the source.
  if (window.ModRegistry) {
    const mods = [];
    if (this.easy) mods.push("EZ");
    if (this.hardrock) mods.push("HR");
    // DT/NC split: nightcore implies doubletime (NC = DT + pitch).
    // Old settings have nightcore=true meaning "1.5x + pitch" = NC.
    // New settings have separate doubletime + nightcore flags.
    if (this.doubletime) mods.push("DT");
    if (this.nightcore) mods.push("NC");
    if (this.daycore) mods.push("HT");
    if (this.hidden) mods.push("HD");
    if (this.nofail) mods.push("NF");
    if (this.suddendeath) mods.push("SD");
    if (this.perfect) mods.push("PF");
    if (this.spunout) mods.push("SO");
    if (this.classic) mods.push("CL");
    if (this.autoplay) mods.push("AT");
    if (this.flashlight) {
      // Bridge UI settings (flSize0/flSize200) to the mod's native curve keys.
      const size0 = parseFloat(this.flSize0) || 400;
      const size200 = parseFloat(this.flSize200) || 250;
      mods.push({ acronym: "FL", settings: {
        sizeCombo0: size0,
        sizeCombo100: Math.round(size0 + (size200 - size0) * 0.5),
        sizeCombo200: size200,
        sliderDim: 0.3,
      }});
    }
    if (this.relax) mods.push("RX");
    if (this.autopilot) mods.push("AP");
    if (this.targetpractice) {
      mods.push({ acronym: "TP", settings: {
        targetSize: parseFloat(this.tpSize) || 1.0,
        spawnRate: 1000,
      }});
    }
    if (this.adaptiveSpeed) {
      mods.push({ acronym: "AS", settings: {
        maxRate: parseFloat(this.asMaxRate) || 1.05,
        adjustStep: 0.01,
        streakRequired: 5,
      }});
    }
    if (this.magnetised) mods.push("MG");
    if (this.wobble) mods.push("WO");
    if (this.windup) mods.push("WU");
    if (this.traceable) mods.push("TR");
    if (this.approachDifferent) mods.push("AD");
    if (this.bubbles) mods.push("BU");
    if (this.repel) mods.push("RP");
    if (this.depth) mods.push("DP");
    if (this.transform) {
      mods.push({ acronym: "TF", settings: {
        rotate: parseFloat(this.tfRotate) || 0,
        translateX: 0,
        translateY: 0,
        scale: 1.0,
      }});
    }
    if (this.noscope) mods.push("NS");
    if (this.difficultyAdjust) {
      mods.push({ acronym: "DA", settings: {
        ar: parseFloat(this.customAR) || 0,
        cs: parseFloat(this.customCS) || 0,
        od: parseFloat(this.customOD) || 0,
        hp: parseFloat(this.customHP) || 0,
      }});
    }
    window.ModRegistry.setActive(mods);
    g.mods = window.ModRegistry.getActive();
    // apply mod effects to the game object (flags, playbackRate hints, etc.)
    window.ModRegistry.applyToGame(g);
  }
};
gamesettings.refresh = loadFromLocal;
gamesettings.save = saveToLocal;
gamesettings.syncFromServer = syncFromServer;

loadFromLocal();
window.gamesettings = gamesettings;
// if game already exists (initgame loaded first), push settings immediately
try { if (window.game) gamesettings.loadToGame(); } catch {}
export { gamesettings, defaultsettings, loadFromLocal, saveToLocal, syncFromServer };
