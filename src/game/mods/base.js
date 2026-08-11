// Mod base class — mirrors lazer's Mod class hierarchy.
// Each mod is a class with: acronym, name, type, scoreMultiplier, settings,
// and apply methods (applyToDifficulty, applyToTrack, applyToGame, applyToAudio).
// The ModRegistry (index.js) holds the active set and drives the apply pipeline.

export const ModType = {
  DifficultyIncrease: "DifficultyIncrease",
  DifficultyReduction: "DifficultyReduction",
  Automation: "Automation",
  Conversion: "Conversion",
  Fun: "Fun",
};

export class Mod {
  // Override in subclasses
  acronym = "";      // "HR", "HD", "FL", etc.
  name = "";         // "Hard Rock", "Hidden", "Flashlight"
  type = ModType.DifficultyIncrease;
  scoreMultiplier = 1.0;  // lazer Mod.ScoreMultiplier
  bit = 0;           // legacy bitmask bit (for PP/leaderboard back-compat); 0 = no bit (new mods use mod string)
  settings = {};     // mod-specific settings (DA sliders, FL size, NC pitch, etc.)
  defaultSettings = {};

  constructor(settings) {
    this.settings = { ...this.defaultSettings, ...(settings || {}) };
  }

  // Apply to difficulty values (CS, AR, OD, HP) — mutate the passed object.
  // Called in order on the difficulty object before gameplay starts.
  applyToDifficulty(d) {}

  // Apply to the parsed track (hitObjects, timingPoints) — mutate in place.
  // Called once after parsing, before stacking/curve calc.
  applyToTrack(t) {}

  // Apply to the game object (game.flags, game.playbackRate, etc.) — mutate.
  // Called once when the mod set is activated (before Playback construction).
  applyToGame(g) {}

  // Apply to the audio object (playbackRate, detune) — mutate.
  // Called once when audio is loaded.
  applyToAudio(audio) {}

  // Whether this mod makes the score unranked (RX, AP return true).
  // Lazer: Relax/AutoPilot/SpunOut/Autoplay produce unranked scores.
  get unranked() { return false; }

  // Whether this mod implies another mod (NC implies DT, etc.).
  // Returns an array of Mod classes to also activate.
  implies() { return []; }

  // Acronyms of mods that cannot be active at the same time as this mod.
  // Returns an array of strings. Subclasses override to declare conflicts.
  incompatibleWith() { return []; }

  // Reset settings to defaults.
  resetSettings() { this.settings = { ...this.defaultSettings }; }
}

export default Mod;