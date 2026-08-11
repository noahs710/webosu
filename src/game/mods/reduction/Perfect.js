import { Mod, ModType } from "../base.js";

// Perfect — lazer: one non-300 = fail. Multiplier 1.0.
// Legacy bitmask bit 16384.
export class ModPerfect extends Mod {
  acronym = "PF";
  name = "Perfect";
  type = ModType.DifficultyReduction;
  scoreMultiplier = 1.0;
  bit = 16384;

  applyToGame(g) { g.perfect = true; }

  incompatibleWith() { return ["NF", "SD"]; }
}

export default ModPerfect;
