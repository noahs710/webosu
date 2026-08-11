import { Mod, ModType } from "../base.js";

// Wind Up — lazer: approach rate increases over the song. Unranked.
export class ModWindUp extends Mod {
  acronym = "WU";
  name = "Wind Up";
  type = ModType.Fun;
  scoreMultiplier = 0.0;
  bit = 0;
  defaultSettings = { startRate: 0.5, endRate: 1.5 };  // approach-time multipliers
  applyToGame(g) { g.windup = true; }
  get unranked() { return true; }
}
export default ModWindUp;