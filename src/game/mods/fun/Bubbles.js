import { Mod, ModType } from "../base.js";

// Bubbles — lazer: spawn a bubble on each hit that floats up and fades. Unranked.
export class ModBubbles extends Mod {
  acronym = "BU";
  name = "Bubbles";
  type = ModType.Fun;
  scoreMultiplier = 0.0;
  bit = 0;
  defaultSettings = { lifetime: 800, spawnRate: 1 };  // ms, bubbles per hit
  applyToGame(g) { g.bubbles = true; }
  get unranked() { return true; }
}
export default ModBubbles;