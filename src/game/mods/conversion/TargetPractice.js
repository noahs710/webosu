import { Mod, ModType } from "../base.js";

// Target Practice — lazer: accuracy-based scoring, fixed spawn rate.
// Multiplier 1.0. No legacy bit. Conversion mod.
export class ModTargetPractice extends Mod {
  acronym = "TP";
  name = "Target Practice";
  type = ModType.Conversion;
  scoreMultiplier = 1.0;
  bit = 0;
  defaultSettings = {
    targetSize: 1.0,        // multiplier on the hit-acceptance radius
    spawnRate: 1000,        // ms between target appearances (overrides AR)
  };

  applyToGame(g) { g.targetpractice = true; }
}

export default ModTargetPractice;