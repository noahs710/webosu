import { Mod, ModType } from "../base.js";

// Traceable — lazer: hit objects hidden until cursor is near. Unranked.
export class ModTraceable extends Mod {
  acronym = "TR";
  name = "Traceable";
  type = ModType.Fun;
  scoreMultiplier = 0.0;
  bit = 0;
  defaultSettings = { revealRadius: 120 };  // osu! pixels
  applyToGame(g) { g.traceable = true; }
  get unranked() { return true; }
}
export default ModTraceable;