import { Mod, ModType } from "../base.js";

// Spun Out — lazer: spinners auto-complete. Multiplier 0.9. Unranked in lazer.
// Legacy bitmask bit 4096.
export class ModSpunOut extends Mod {
  acronym = "SO";
  name = "Spun Out";
  type = ModType.DifficultyReduction;
  scoreMultiplier = 0.9;
  bit = 4096;

  applyToGame(g) { g.spunout = true; }

  get unranked() { return false; }  // lazer: SO is ranked with 0.9x; keep ranked
}

export default ModSpunOut;