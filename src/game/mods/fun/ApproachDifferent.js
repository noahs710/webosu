import { Mod, ModType } from "../base.js";

// Approach Different — lazer: custom approach circle easing. Unranked.
export class ModApproachDifferent extends Mod {
  acronym = "AD";
  name = "Approach Different";
  type = ModType.Fun;
  scoreMultiplier = 0.0;
  bit = 0;
  defaultSettings = { style: "ease-in" };  // linear/ease-in/ease-out/ease-in-out
  applyToGame(g) { g.approachDifferent = true; }
  get unranked() { return true; }
}
export default ModApproachDifferent;