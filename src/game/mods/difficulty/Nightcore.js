import { Mod, ModType } from "../base.js";
import { ModDoubleTime } from "./DoubleTime.js";

// Nightcore — lazer: DT (1.5x speed) + pitch shift. Multiplier 1.12.
// NC implies DT (the ModRegistry resolves implies() automatically).
// Legacy bitmask bit 64 (shared with DT; the old game.nightcore flag meant both).
export class ModNightcore extends ModDoubleTime {
  acronym = "NC";
  name = "Nightcore";
  type = ModType.DifficultyIncrease;
  scoreMultiplier = 1.12;
  bit = 64;

  constructor(settings) {
    super(settings);
    // NC-specific settings: pitch shift amount (lazer: pitch is tied to speed)
    this.defaultSettings = { ...this.defaultSettings, pitch: 1.5 };
  }

  applyToGame(g) {
    super.applyToGame(g);
    g.nightcore = true;  // back-compat
  }

  applyToAudio(audio) {
    if (audio) {
      audio.playbackRate = 1.5;
      // pitch shift: lazer NC pitches up with speed.
      // Web Audio: detune is in cents; 1.5x speed ≈ +7 semitones ≈ +700 cents.
      // We set it in osu-audio.js's applyToAudio hook if the audio supports detune.
      if (audio.detune !== undefined) audio.detune = 700;
    }
  }

  // NC doesn't need implies() returning DT because it IS a DT subclass.
  // The ModRegistry sees NC as active and calls its inherited DT methods.
}

export default ModNightcore;