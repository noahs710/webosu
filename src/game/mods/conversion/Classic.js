import { Mod, ModType } from "../base.js";

// Classic — lazer: stable-style scoring (V1 combo-bloated), disables the OK window.
// Multiplier 1.0. No legacy bit (new mod in the modern sense; the old game.classic flag).
export class ModClassic extends Mod {
  acronym = "CL";
  name = "Classic";
  type = ModType.Conversion;
  scoreMultiplier = 1.0;
  bit = 0;

  applyToGame(g) { g.classic = true; }
}

export default ModClassic;