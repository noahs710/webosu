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
  easy: false, daycore: false, hardrock: false, nightcore: false, hidden: false, autoplay: false,
  hideNumbers: false, hideGreat: true, hideFollowPoints: false,
  nofail: false, suddendeath: false, perfect: false, spunout: false, classic: false,
  difficultyAdjust: false, customAR: 0, customCS: 0, customOD: 0, customHP: 0,
  soundNames: undefined,
};

const gamesettings = {};
Object.assign(gamesettings, defaultsettings);
gamesettings.restoreCallbacks = [];

function loadFromLocal() {
  try {
    const str = localStorage.getItem("osugamesettings");
    if (str) {
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
};
gamesettings.refresh = loadFromLocal;
gamesettings.save = saveToLocal;
gamesettings.syncFromServer = syncFromServer;

loadFromLocal();
window.gamesettings = gamesettings;
// if game already exists (initgame loaded first), push settings immediately
try { if (window.game) gamesettings.loadToGame(); } catch {}
export { gamesettings, defaultsettings, loadFromLocal, saveToLocal, syncFromServer };
