import { Mod, ModType } from "../base.js";

// Easy — lazer: CS/AR/OD/HP *0.5. Multiplier 0.5.
// Lazer Easy also gives 2 extra lives (retries on fail) — out of scope for now.
// Legacy bitmask bit 2.
export class ModEasy extends Mod {
  acronym = "EZ";
  name = "Easy";
  type = ModType.DifficultyReduction;
  scoreMultiplier = 0.5;
  bit = 2;

  applyToDifficulty(d) {
    d.CS = d.CS * 0.5;
    d.AR = d.AR * 0.5;
    d.OD = d.OD * 0.5;
    d.HP = d.HP * 0.5;
  }

  applyToGame(g) { g.easy = true; }

  incompatibleWith() { return ["HR"]; }
}

export default ModEasy;
