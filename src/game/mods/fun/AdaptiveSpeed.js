import { Mod, ModType } from "../base.js";

// Adaptive Speed — lazer: dynamically adjusts audio playback rate based on accuracy.
// Multiplier 1.0. No legacy bit. Fun mod.
export class ModAdaptiveSpeed extends Mod {
  acronym = "AS";
  name = "Adaptive Speed";
  type = ModType.Fun;
  scoreMultiplier = 1.0;
  bit = 0;
  defaultSettings = {
    maxRate: 1.05,       // lazer max rate
    adjustStep: 0.01,    // per-judgement step
    streakRequired: 5,   // consecutive greats to increase
  };

  applyToGame(g) { g.adaptiveSpeed = true; }
}

export default ModAdaptiveSpeed;