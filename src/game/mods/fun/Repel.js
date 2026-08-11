import { Mod, ModType } from "../base.js";

// Repel — lazer: cursor pushed away from hit objects. Unranked.
export class ModRepel extends Mod {
  acronym = "RP";
  name = "Repel";
  type = ModType.Fun;
  scoreMultiplier = 0.0;
  bit = 0;
  defaultSettings = { repelRadius: 100 };  // osu! pixels
  applyToGame(g) { g.repel = true; }
  get unranked() { return true; }
}
export default ModRepel;