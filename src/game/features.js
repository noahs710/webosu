// features.js — runtime feature flags for lazer-parity-mega rollout.
//
// Four flags gate the campaign's behavioral changes. All default OFF so the
// legacy code paths stay live until the conformance harness validates them.
// Flags flip to default-on one at a time (see design.md Phase 7) and are
// removed entirely once stable.
//
// API:
//   window.FEATURES.lazerSliderJudging   -> per-part slider judging (Track A)
//   window.FEATURES.lazerScoreV2         -> score V2 combo portion, no HP cap (Track A)
//   window.FEATURES.lazerHpDrain         -> per-map drain rate, break pause (Track A)
//   window.FEATURES.skinConformance      — Track B skin.ini wiring + @2x variants
//
//   window.Features.isOn(name)           -> bool
//   window.Features.set(name, bool)      -> runtime toggler (dev / harness)
//   window.Features.snapshot()           -> {name: bool} for tests

const DEFAULTS = {
   lazerSliderJudging: false,
   lazerScoreV2: false,
   lazerHpDrain: false,
   skinConformance: false,
};

// Allow URL overrides for manual testing without localStorage:
//   ?features=lazerSliderJudging,lazerHpDrain
// and persistence via localStorage key webosu_features.<name> = "1" / "0"
function readInitial(name) {
   try {
      const url = new URLSearchParams(window.location.search);
      const csv = url.get("features");
      if (csv) {
         const set = new Set(csv.split(",").map((s) => s.trim()).filter(Boolean));
         if (set.has(name)) return true;
         if (set.has(`!${name}`)) return false;
      }
   } catch {}
   try {
      const v = window.localStorage.getItem(`webosu_features.${name}`);
      if (v === "1") return true;
      if (v === "0") return false;
   } catch {}
   return DEFAULTS[name];
}

const state = {};
for (const key of Object.keys(DEFAULTS)) state[key] = readInitial(key);

// Clean up any flags that were persisted by the OLD Features.set (which
// wrote to localStorage). The new Features.set does NOT persist, but old
// flags from a previous session may still be in localStorage and would
// activate via readInitial above. Remove them so the flags are clean.
try {
   for (const key of Object.keys(DEFAULTS)) {
      const k = `webosu_features.${key}`;
      if (window.localStorage.getItem(k) !== null) {
         window.localStorage.removeItem(k);
      }
   }
} catch {}

window.FEATURES = new Proxy(state, {
   get(target, prop) {
      if (prop in target) return target[prop];
      return undefined;
   },
   set(target, prop, value) {
      if (!(prop in target)) {
         // Only allow known flag names; silently reject unknown to catch typos early.
         if (import.meta.env.DEV) {
            console.warn(`[FEATURES] attempted set on unknown flag "${String(prop)}"`);
         }
         return true; // pretend success — do not throw, this runs in playback hot path
      }
      target[prop] = !!value;
      return true;
   },
});

window.Features = {
   isOn(name) {
      return window.FEATURES[name] === true;
   },
   set(name, value) {
      if (!(name in state)) {
         if (import.meta.env.DEV) {
            console.warn(`[FEATURES] cannot set unknown flag "${name}"`);
         }
         return false;
      }
      window.FEATURES[name] = !!value;
      // NOTE: do NOT persist to localStorage — the conformance harness uses
      // Features.set and persistence leaked flags into the user's real browser
      // sessions, causing instant-fail bugs. Flags are URL-only (?features=...)
      // or set at runtime (non-persistent). Use window.FEATURES.<name> = true
      // for non-persistent runtime sets (e.g. from the harness).
      return true;
   },
   snapshot() {
      return Object.assign({}, state);
   },
};
