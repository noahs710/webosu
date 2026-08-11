import { Mod, ModType } from "../base.js";

// Hidden — lazer: objects fade out early, no approach circle for subsequent objects.
// Multiplier 1.06. Legacy bitmask bit 8.
export class ModHidden extends Mod {
  acronym = "HD";
  name = "Hidden";
  type = ModType.DifficultyIncrease;
  scoreMultiplier = 1.06;
  bit = 8;

  applyToGame(g) { g.hidden = true; }
}

export default ModHidden;