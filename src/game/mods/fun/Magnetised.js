import { Mod, ModType } from "../base.js";

// Magnetised — lazer: cursor snaps toward hit objects within a radius. Unranked (0x).
export class ModMagnetised extends Mod {
  acronym = "MG";
  name = "Magnetised";
  type = ModType.Fun;
  scoreMultiplier = 0.0;
  bit = 0;
  defaultSettings = { magnetRadius: 100 };  // osu! pixels
  applyToGame(g) { g.magnetised = true; }
  get unranked() { return true; }
}
export default ModMagnetised;