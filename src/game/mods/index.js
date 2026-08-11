// ModRegistry — holds the active mod set and drives the apply pipeline.
// Mirrors lazer's ModUtil / ruleset mod application order.
import { Mod, ModType } from "./base.js";

// Base lazer-style incompatibility matrix. Each entry maps an acronym to the
// set of acronyms it cannot coexist with. Mod classes can declare their own
// conflicts via incompatibleWith(); this matrix covers the canonical rules.
const BASE_INCOMPATIBILITY = {
  HR: ["EZ"],
  EZ: ["HR"],
  DT: ["HT"],
  HT: ["DT"],
  NF: ["SD", "PF"],
  SD: ["NF", "PF"],
  PF: ["NF", "SD"],
  AT: ["RX", "AP"],
  RX: ["AT", "AP"],
  AP: ["AT", "RX"],
};

class ModRegistryClass {
  constructor() {
    this._registered = new Map();  // acronym -> Mod class
    this._incompatible = new Map();  // acronym -> Set(acronym)
    this._active = [];             // array of active Mod instances
  }

  // Register a Mod class (call once at module load for each mod).
  register(ModClass) {
    const inst = new ModClass();
    if (!inst.acronym) throw new Error("Mod has no acronym: " + ModClass.name);
    this._registered.set(inst.acronym, ModClass);
    // compute incompatibility set for this mod
    const set = new Set();
    const base = BASE_INCOMPATIBILITY[inst.acronym];
    if (base) for (const a of base) set.add(a);
    for (const a of inst.incompatibleWith()) set.add(a);
    this._incompatible.set(inst.acronym, set);
  }

  // Get a fresh instance of a mod by acronym (with optional settings).
  create(acronym, settings) {
    const ModClass = this._registered.get(acronym);
    if (!ModClass) return null;
    return new ModClass(settings);
  }

  // Set the active mod set from an array of acronyms (or {acronym, settings} objects).
  // Resolves implies() chains (NC implies DT, etc.) without duplicating.
  // Returns the list of acronyms that were removed due to incompatibility.
  setActive(modSpecs) {
    const specs = (modSpecs || []).map(s => (typeof s === "string" ? { acronym: s } : s));
    const seen = new Set();
    const removed = [];
    this._active = [];
    for (const spec of specs) {
      if (seen.has(spec.acronym)) continue;
      const inst = this.create(spec.acronym, spec.settings);
      if (!inst) {
        if (import.meta.env?.DEV) console.warn("[ModRegistry] unknown mod:", spec.acronym);
        continue;
      }
      // remove any already-active mods that conflict with this one
      const conflicts = this._incompatible.get(inst.acronym);
      if (conflicts) {
        for (let i = this._active.length - 1; i >= 0; --i) {
          const activeAcronym = this._active[i].acronym;
          if (conflicts.has(activeAcronym)) {
            removed.push(activeAcronym);
            seen.delete(activeAcronym);
            this._active.splice(i, 1);
          }
        }
      }
      seen.add(spec.acronym);
      this._active.push(inst);
      // resolve implied mods
      for (const Implied of inst.implies()) {
        const impliedInst = new Implied();
        if (!seen.has(impliedInst.acronym)) {
          // implied mods may also conflict with existing active mods
          const impliedConflicts = this._incompatible.get(impliedInst.acronym);
          if (impliedConflicts) {
            for (let i = this._active.length - 1; i >= 0; --i) {
              const activeAcronym = this._active[i].acronym;
              if (impliedConflicts.has(activeAcronym)) {
                removed.push(activeAcronym);
                seen.delete(activeAcronym);
                this._active.splice(i, 1);
              }
            }
          }
          seen.add(impliedInst.acronym);
          this._active.push(impliedInst);
        }
      }
    }
    return removed;
  }

  // Validate a prospective mod set without changing the active set.
  // Returns { valid: [...cleaned specs...], removed: [...acronyms...] }.
  // valid preserves the original spec shape (acronym strings or {acronym, settings} objects).
  validateActiveSet(modSpecs) {
    const specs = (modSpecs || []).map(s => (typeof s === "string" ? { acronym: s } : s));
    const prev = this._active;
    this._active = [];
    const removed = this.setActive(specs);
    const validAcronyms = new Set(this._active.map(m => m.acronym));
    const valid = specs.filter(s => validAcronyms.has(s.acronym)).map(s => (typeof s === "string" ? s.acronym : s));
    this._active = prev;
    return { valid, removed };
  }

  // Get the active mod instances.
  getActive() { return this._active; }

  // True if a mod with the given acronym is active.
  isActive(acronym) { return this._active.some(m => m.acronym === acronym); }

  // Get the active mod instance for an acronym (or null).
  get(acronym) { return this._active.find(m => m.acronym === acronym) || null; }

  // Product of all active mod score multipliers.
  scoreMultiplier() {
    let m = 1.0;
    for (const mod of this._active) m *= mod.scoreMultiplier;
    return m;
  }

  // Apply all active mods to a difficulty object {CS, AR, OD, HP} (mutates).
  applyToDifficulty(d) {
    for (const mod of this._active) mod.applyToDifficulty(d);
  }

  // Apply all active mods to a parsed track (mutates).
  applyToTrack(t) {
    for (const mod of this._active) mod.applyToTrack(t);
  }

  // Apply all active mods to the game object (mutates).
  applyToGame(g) {
    for (const mod of this._active) mod.applyToGame(g);
  }

  // Apply all active mods to the audio object (mutates).
  applyToAudio(audio) {
    for (const mod of this._active) mod.applyToAudio(audio);
  }

  // Serialize the active set as an array of acronyms (for replay v2 / leaderboard).
  serialize() {
    return this._active.map(m => m.acronym);
  }

  // Serialize as a joined string "HR+HD+FL" (for the results screen display).
  serializeDisplay() {
    const a = this.serialize();
    return a.length ? a.join("+") : "";
  }

  // Legacy bitmask for back-compat with the PP/leaderboard backend.
  // New mods that don't have a legacy bit return 0; the backend also accepts
  // a mod string for the full set, so the bitmask is only for old mods.
  toBitmask() {
    let bits = 0;
    for (const mod of this._active) bits |= (mod.bit || 0);
    return bits;
  }

  // Whether any active mod makes the score unranked.
  isUnranked() {
    return this._active.some(m => m.unranked);
  }

  // List all registered mod acronyms (for the UI / validation).
  allAcronyms() {
    return Array.from(this._registered.keys());
  }

  // Get all registered Mod classes (for the UI to iterate by type).
  allClasses() {
    return Array.from(this._registered.values());
  }
}

export const ModRegistry = new ModRegistryClass();
export { Mod, ModType };
export default ModRegistry;