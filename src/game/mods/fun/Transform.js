import { Mod, ModType } from "../base.js";

// Transform — lazer: geometric transform (rotate/translate/scale) on hit positions. Unranked.
export class ModTransform extends Mod {
  acronym = "TF";
  name = "Transform";
  type = ModType.Fun;
  scoreMultiplier = 0.0;
  bit = 0;
  defaultSettings = { rotate: 0, translateX: 0, translateY: 0, scale: 1.0 };
  applyToGame(g) { g.transform = true; }
  get unranked() { return true; }
}
export default ModTransform;