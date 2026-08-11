import { Mod, ModType } from "../base.js";

// Wobble — lazer: sine-wave displacement on all hit object positions. Unranked.
export class ModWobble extends Mod {
  acronym = "WO";
  name = "Wobble";
  type = ModType.Fun;
  scoreMultiplier = 0.0;
  bit = 0;
  defaultSettings = { strength: 8, frequency: 0.005 };  // osu! pixels, Hz-ish
  applyToGame(g) { g.wobble = true; }
  get unranked() { return true; }
}
export default ModWobble;