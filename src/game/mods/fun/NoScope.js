import { Mod, ModType } from "../base.js";

// No Scope — lazer: cursor hidden unless a key is held. Unranked.
export class ModNoScope extends Mod {
  acronym = "NS";
  name = "No Scope";
  type = ModType.Fun;
  scoreMultiplier = 0.0;
  bit = 0;
  defaultSettings = { revealDuration: 200 };  // ms to stay visible after release
  applyToGame(g) { g.noscope = true; }
  get unranked() { return true; }
}
export default ModNoScope;