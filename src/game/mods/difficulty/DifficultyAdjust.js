import { Mod, ModType } from "../base.js";

// Difficulty Adjust — lazer: per-attribute overrides with Min(max, base + adj) scaling.
// Settings: { cs, ar, od, hp } each in [-10, 10] delta from base (0 = no change).
// Multiplier 1.0 (lazer: DA doesn't change score multiplier).
// No legacy bit (new mod).
export class ModDifficultyAdjust extends Mod {
  acronym = "DA";
  name = "Difficulty Adjust";
  type = ModType.DifficultyReduction;
  scoreMultiplier = 1.0;
  bit = 0;
  defaultSettings = { cs: 0, ar: 0, od: 0, hp: 0 };

  applyToDifficulty(d) {
    const s = this.settings;
    // lazer: Min(max, base + adj); allow negative adjustments too (Min(10, Max(0, base+adj)))
    if (s.cs) d.CS = Math.min(10, Math.max(0, d.CS + s.cs));
    if (s.ar) d.AR = Math.min(10, Math.max(0, d.AR + s.ar));
    if (s.od) d.OD = Math.min(10, Math.max(0, d.OD + s.od));
    if (s.hp) d.HP = Math.min(10, Math.max(0, d.HP + s.hp));
  }

  applyToGame(g) {
    g.difficultyAdjust = true;
    // back-compat: the old code read game.customAR/CS/OD/HP with a >= 0 gate
    g.customAR = this.settings.ar;
    g.customCS = this.settings.cs;
    g.customOD = this.settings.od;
    g.customHP = this.settings.hp;
  }
}

export default ModDifficultyAdjust;