import { Mod, ModType } from "../base.js";

// Sudden Death — lazer: one miss = fail. Multiplier 1.0.
// Legacy bitmask bit 32.
export class ModSuddenDeath extends Mod {
  acronym = "SD";
  name = "Sudden Death";
  type = ModType.DifficultyReduction;
  scoreMultiplier = 1.0;
  bit = 32;

  applyToGame(g) { g.suddendeath = true; }

  incompatibleWith() { return ["NF", "PF"]; }
}

export default ModSuddenDeath;
