// GameState — centralized, observable seam over the legacy window.game object.
//
// Design:
//   - The shell (gamesettings.js, Vue components) and future callers read/write
//     through this module instead of mutating window.game directly.
//   - The game engine (playback.js, playerActions.js, overlays) continues to
//     read window.game during the deprecation window.
//   - GameState mirrors every write back to window.game synchronously, and
//     routes mod changes through ModRegistry so the registry stays canonical.
//
// Paths:
//   - "display.<key>"  -> maps to window.game display keys
//   - "audio.<key>"    -> maps to window.game audio keys
//   - "input.<key>"    -> maps to window.game input keys
//   - "mods.<flag>"    -> mod flat flag, routed through ModRegistry
//   - "settings.<key>" -> gamesettings-only key (e.g. flSize0, customAR)
//   - bare "<key>"     -> managed key directly
//
// Deprecation window:
//   - Non-engine code should use GameState.get/set/setBatch/subscribe.
//   - Direct writes to managed window.game keys emit a dev-mode warning.
//   - The engine will be migrated in a later change; then window.game can be
//     removed as the underlying store.

import { gamesettings } from "./gamesettings.js";

// Keys that are managed by GameState and kept in sync on window.game.
const MANAGED_KEYS = new Set([
   // display
   "backgroundDimRate", "backgroundBlurRate", "cursorSize", "showhwmouse",
   "snakein", "snakeout", "autofullscreen", "overridedpi", "dpiscale",
   "allowMouseScroll", "allowMouseButton", "hideNumbers", "hideGreat", "hideFollowPoints",
   // audio
   "masterVolume", "effectVolume", "musicVolume", "beatmapHitsound", "globalOffset",
   // input
   "K1keycode", "K2keycode", "ESCkeycode", "ESC2keycode", "CTRLkeycode",
   // mod flat flags
   "easy", "daycore", "hardrock", "nightcore", "doubletime", "hidden", "autoplay",
   "nofail", "suddendeath", "perfect", "spunout", "classic", "difficultyAdjust",
   "customAR", "customCS", "customOD", "customHP", "flashlight",
   "relax", "autopilot", "targetpractice", "adaptiveSpeed",
   "magnetised", "wobble", "windup", "traceable", "approachDifferent",
   "bubbles", "repel", "depth", "transform", "noscope",
]);

// Mapping from flat flag -> mod acronym for ModRegistry routing.
const FLAG_TO_MOD_ACRONYM = {
   hardrock: "HR", easy: "EZ", doubletime: "DT", nightcore: "NC", daycore: "HT",
   hidden: "HD", autoplay: "AT", nofail: "NF", suddendeath: "SD", perfect: "PF",
   spunout: "SO", classic: "CL", flashlight: "FL", relax: "RX", autopilot: "AP",
   targetpractice: "TP", adaptiveSpeed: "AS", magnetised: "MG", wobble: "WO",
   windup: "WU", traceable: "TR", approachDifferent: "AD", bubbles: "BU",
   repel: "RP", depth: "DP", transform: "TF", noscope: "NS",
   difficultyAdjust: "DA",
};

// Mapping from gamesettings keys -> window.game keys for the settings bridge.
const GAMESETTINGS_TO_GAME = {
   dim: "backgroundDimRate", blur: "backgroundBlurRate", cursorsize: "cursorSize",
   showhwmouse: "showhwmouse", snakein: "snakein", snakeout: "snakeout",
   autofullscreen: "autofullscreen", sysdpi: "overridedpi", dpiscale: "dpiscale",
   disableWheel: "allowMouseScroll", disableButton: "allowMouseButton",
   K1keycode: "K1keycode", K2keycode: "K2keycode",
   Kpausekeycode: "ESCkeycode", Kpause2keycode: "ESC2keycode", Kskipkeycode: "CTRLkeycode",
   mastervolume: "masterVolume", effectvolume: "effectVolume", musicvolume: "musicVolume",
   beatmapHitsound: "beatmapHitsound", audiooffset: "globalOffset",
   hideNumbers: "hideNumbers", hideGreat: "hideGreat", hideFollowPoints: "hideFollowPoints",
};

// Settings keys that need normalization when crossing the bridge to window.game.
// A normalizer is only applied when the path used the gamesettings source key.
const NORMALIZERS = {
   backgroundDimRate: v => v / 100,
   backgroundBlurRate: v => v / 100,
   cursorSize: v => parseFloat(v),
   masterVolume: v => v / 100,
   effectVolume: v => v / 100,
   musicVolume: v => v / 100,
   globalOffset: v => parseFloat(v),
   overridedpi: v => !v,
   allowMouseScroll: v => !v,
   allowMouseButton: v => !v,
   customAR: v => parseFloat(v),
   customCS: v => parseFloat(v),
   customOD: v => parseFloat(v),
   customHP: v => parseFloat(v),
};

class GameState {
   constructor() {
      this._game = null;
      this._subs = new Map(); // path -> Set(callback)
      this._warned = new Set();
      this._enabled = false;
      this._applying = false; // true while GameState itself is writing window.game
   }

   // Bind to the legacy window.game object and install the direct-write guard.
   bind(game = window.game) {
      if (!game) return;
      this._enabled = true;
      this._game = this._installLegacyGuard(game);
   }

   // Resolve a dot-separated path to its storage and legacy game keys.
   _resolve(path) {
      const dot = path.indexOf(".");
      let namespace = "";
      let key = path;
      if (dot > 0) {
         namespace = path.slice(0, dot);
         key = path.slice(dot + 1);
      }
      // Mod flags: bare flag name or "mods.<flag>".
      const acronym = FLAG_TO_MOD_ACRONYM[key];
      if (acronym && (namespace === "mods" || !namespace)) {
         return { namespace, key, gameKey: key, gsKey: key, isMod: true, acronym };
      }
      const mappedGameKey = GAMESETTINGS_TO_GAME[key];
      if (mappedGameKey) {
         return { namespace, key, gameKey: mappedGameKey, gsKey: key, isMod: false, isRawKey: true };
      }
      return { namespace, key, gameKey: key, gsKey: key, isMod: false };
   }

   get(path) {
      const { gameKey, gsKey, isMod, acronym } = this._resolve(path);
      if (isMod) {
         if (window.ModRegistry) return window.ModRegistry.isActive(acronym);
         return gamesettings[gsKey];
      }
      if (gsKey in gamesettings) return gamesettings[gsKey];
      const g = this._game || window.game;
      return g ? g[gameKey] : undefined;
   }

   set(path, value) {
      return this.setBatch({ [path]: value });
   }

   setBatch(updates, force = false) {
      const changed = [];
      for (const path in updates) {
         const { gameKey, gsKey, isMod, isRawKey } = this._resolve(path);
         const value = updates[path];
         let oldValue;
         if (isMod) {
            // Mod flags are canonically stored in gamesettings. Their runtime
            // value may come from ModRegistry.isActive, so compare intended
            // state (gamesettings[flag]) rather than the runtime derived value.
            oldValue = gamesettings[gsKey];
         } else if (gsKey in gamesettings) {
            oldValue = gamesettings[gsKey];
         } else {
            const g = this._game || window.game;
            oldValue = g ? g[gameKey] : undefined;
         }
         if (force || oldValue !== value) changed.push({ path, gameKey, gsKey, value, oldValue, isMod, isRawKey });
      }
      if (!changed.length) return 0;

      // Update gamesettings for all changed keys. Mod flags are the canonical
      // source used by _buildModSpecs, so they must be written too.
      for (const { gsKey, value } of changed) {
         if (gsKey in gamesettings) gamesettings[gsKey] = value;
      }

      // Route mod changes through ModRegistry in one call.
      const modChanged = changed.some(c => c.isMod);
      if (modChanged && window.ModRegistry) {
         const specs = this._buildModSpecs();
         window.ModRegistry.setActive(specs);
         this._reinjectModSettings();
         const g = this._game || window.game;
         if (g && window.ModRegistry.applyToGame) window.ModRegistry.applyToGame(g);
      }

      // Sync legacy window.game and notify subscribers.
      const g = this._game || window.game;
      this._applying = true;
      try {
         for (const { path, gameKey, gsKey, value, oldValue, isMod, isRawKey, acronym } of changed) {
            if (g && MANAGED_KEYS.has(gameKey)) {
               let gameValue = value;
               if (isMod) {
                  gameValue = window.ModRegistry ? window.ModRegistry.isActive(acronym) : value;
               } else if (NORMALIZERS[gameKey] && isRawKey) {
                  // Path used the gamesettings source key; normalize for the runtime game key.
                  gameValue = NORMALIZERS[gameKey](value);
               }
               g[gameKey] = gameValue;
            }
            this._notify(path, value, oldValue);
         }
      } finally {
         this._applying = false;
      }
      return changed.length;
   }

   subscribe(path, callback) {
      let set = this._subs.get(path);
      if (!set) { set = new Set(); this._subs.set(path, set); }
      set.add(callback);
      return () => set.delete(callback);
   }

   syncLegacy() {
      const g = this._game || window.game;
      if (!g) return;
      this._applying = true;
      try {
         // Rebuild mod state from gamesettings and apply to window.game.
         if (window.ModRegistry) {
            const specs = this._buildModSpecs();
            window.ModRegistry.setActive(specs);
            this._reinjectModSettings();
            if (window.ModRegistry.applyToGame) window.ModRegistry.applyToGame(g);
            const active = new Set(window.ModRegistry.getActive().map(m => m.acronym));
            for (const flag in FLAG_TO_MOD_ACRONYM) {
               g[flag] = active.has(FLAG_TO_MOD_ACRONYM[flag]);
            }
            g.mods = window.ModRegistry.getActive();
         }
         // Sync non-mod settings from gamesettings to window.game.
         for (const gsKey in GAMESETTINGS_TO_GAME) {
            const gameKey = GAMESETTINGS_TO_GAME[gsKey];
            let value = gamesettings[gsKey];
            if (NORMALIZERS[gameKey]) value = NORMALIZERS[gameKey](value);
            g[gameKey] = value;
         }
         // Any remaining gamesettings keys that map 1:1 to managed keys.
         for (const key in gamesettings) {
            if (MANAGED_KEYS.has(key) && !GAMESETTINGS_TO_GAME[key]) {
               let value = gamesettings[key];
               if (NORMALIZERS[key]) value = NORMALIZERS[key](value);
               g[key] = value;
            }
         }
      } finally {
         this._applying = false;
      }
   }

   _gameKeyToGamesettingsKey(gameKey) {
      for (const gsKey in GAMESETTINGS_TO_GAME) {
         if (GAMESETTINGS_TO_GAME[gsKey] === gameKey) return gsKey;
      }
      return null;
   }

   _buildModSpecs() {
      if (!window.ModRegistry) return [];
      const specs = [];
      const push = (acronym, settings) => {
         if (settings) specs.push({ acronym, settings });
         else specs.push(acronym);
      };
      if (gamesettings.hardrock) push("HR");
      if (gamesettings.easy) push("EZ");
      if (gamesettings.doubletime) push("DT");
      if (gamesettings.nightcore) push("NC");
      if (gamesettings.daycore) push("HT");
      if (gamesettings.hidden) push("HD");
      if (gamesettings.nofail) push("NF");
      if (gamesettings.suddendeath) push("SD");
      if (gamesettings.perfect) push("PF");
      if (gamesettings.spunout) push("SO");
      if (gamesettings.classic) push("CL");
      if (gamesettings.autoplay) push("AT");
      if (gamesettings.flashlight) {
         const size0 = parseFloat(gamesettings.flSize0) || 400;
         const size200 = parseFloat(gamesettings.flSize200) || 250;
         push("FL", { sizeCombo0: size0, sizeCombo100: Math.round(size0 + (size200 - size0) * 0.5), sizeCombo200: size200, sliderDim: 0.3 });
      }
      if (gamesettings.relax) push("RX");
      if (gamesettings.autopilot) push("AP");
      if (gamesettings.targetpractice) push("TP", { targetSize: parseFloat(gamesettings.tpSize) || 1.0, spawnRate: 1000 });
      if (gamesettings.adaptiveSpeed) push("AS", { maxRate: parseFloat(gamesettings.asMaxRate) || 1.05, adjustStep: 0.01, streakRequired: 5 });
      if (gamesettings.magnetised) push("MG");
      if (gamesettings.wobble) push("WO");
      if (gamesettings.windup) push("WU");
      if (gamesettings.traceable) push("TR");
      if (gamesettings.approachDifferent) push("AD");
      if (gamesettings.bubbles) push("BU");
      if (gamesettings.repel) push("RP");
      if (gamesettings.depth) push("DP");
      if (gamesettings.transform) push("TF", { rotate: parseFloat(gamesettings.tfRotate) || 0, translateX: 0, translateY: 0, scale: 1.0 });
      if (gamesettings.noscope) push("NS");
      if (gamesettings.difficultyAdjust) push("DA", { ar: parseFloat(gamesettings.customAR) || 0, cs: parseFloat(gamesettings.customCS) || 0, od: parseFloat(gamesettings.customOD) || 0, hp: parseFloat(gamesettings.customHP) || 0 });
      return specs;
   }

   _reinjectModSettings() {
      if (!window.ModRegistry) return;
      const active = window.ModRegistry.getActive();
      for (const mod of active) {
         if (mod.acronym === "FL") {
            const size0 = parseFloat(gamesettings.flSize0) || 400;
            const size200 = parseFloat(gamesettings.flSize200) || 250;
            mod.settings = { ...mod.settings, sizeCombo0: size0, sizeCombo100: Math.round(size0 + (size200 - size0) * 0.5), sizeCombo200: size200, sliderDim: 0.3 };
         } else if (mod.acronym === "AS") {
            mod.settings = { ...mod.settings, maxRate: parseFloat(gamesettings.asMaxRate) || 1.05, adjustStep: 0.01, streakRequired: 5 };
         } else if (mod.acronym === "TF") {
            mod.settings = { ...mod.settings, rotate: parseFloat(gamesettings.tfRotate) || 0, translateX: 0, translateY: 0, scale: 1.0 };
         } else if (mod.acronym === "TP") {
            mod.settings = { ...mod.settings, targetSize: parseFloat(gamesettings.tpSize) || 1.0, spawnRate: 1000 };
         } else if (mod.acronym === "DA") {
            mod.settings = { ...mod.settings, ar: parseFloat(gamesettings.customAR) || 0, cs: parseFloat(gamesettings.customCS) || 0, od: parseFloat(gamesettings.customOD) || 0, hp: parseFloat(gamesettings.customHP) || 0 };
         }
      }
   }

   _notify(path, value, oldValue) {
      const set = this._subs.get(path);
      if (set) set.forEach(cb => { try { cb(value, oldValue, path); } catch {} });
   }

   _installLegacyGuard(game) {
      if (typeof import.meta !== "undefined" && import.meta.env && !import.meta.env.DEV) return game;
      if (!game || game.__gameStateGuard) return game;
      game.__gameStateGuard = true;
      const self = this;
      const proxy = new Proxy(game, {
         set(target, prop, value, receiver) {
            if (typeof prop === "string" && MANAGED_KEYS.has(prop) && !self._applying) {
               if (!self._warned.has(prop)) {
                  self._warned.add(prop);
                  console.warn(`[GameState] Direct write to window.game.${prop} detected. Use GameState.set(...) instead.`);
               }
            }
            return Reflect.set(target, prop, value, receiver);
         }
      });
      if (window.game === game) window.game = proxy;
      return proxy;
   }
}

const GameStateInstance = new GameState();
export default GameStateInstance;
