import { Mod, ModType } from "../base.js";

// Hard Rock — lazer: CS*1.3, AR*1.4, OD*1.4, HP*1.4 capped 10. Multiplier 1.06.
// Legacy bitmask bit 16.
export class ModHardRock extends Mod {
  acronym = "HR";
  name = "Hard Rock";
  type = ModType.DifficultyIncrease;
  scoreMultiplier = 1.06;
  bit = 16;

  applyToDifficulty(d) {
    d.CS = Math.min(d.CS * 1.3, 10);
    d.AR = Math.min(d.AR * 1.4, 10);
    d.OD = Math.min(d.OD * 1.4, 10);
    d.HP = Math.min(d.HP * 1.4, 10);
  }

  applyToGame(g) { g.hardrock = true; }

  incompatibleWith() { return ["EZ"]; }
}

export default ModHardRock;