import { Mod, ModType } from "../base.js";

// Depth — lazer: hit objects scale with cursor distance (faux-3D). Unranked.
export class ModDepth extends Mod {
  acronym = "DP";
  name = "Depth";
  type = ModType.Fun;
  scoreMultiplier = 0.0;
  bit = 0;
  defaultSettings = { scaleNear: 1.2, scaleFar: 0.6, maxDist: 400 };
  applyToGame(g) { g.depth = true; }
  get unranked() { return true; }
}
export default ModDepth;