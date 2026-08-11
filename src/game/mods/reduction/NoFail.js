import { Mod, ModType } from "../base.js";

// No Fail — lazer: HP cannot drop below 0, no fail from HP. Multiplier 0.5.
// Legacy bitmask bit 1.
export class ModNoFail extends Mod {
  acronym = "NF";
  name = "No Fail";
  type = ModType.DifficultyReduction;
  scoreMultiplier = 0.5;
  bit = 1;

  applyToGame(g) { g.nofail = true; }

  incompatibleWith() { return ["SD", "PF"]; }
}

export default ModNoFail;
