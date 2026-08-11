import { Mod, ModType } from "../base.js";

// Autoplay (Auto) — lazer: the game auto-plays (cursor + clicks).
// Multiplier 1.0. Unranked (it's a demonstration mod).
// The actual autoplay input logic lives in playerActions.js (existing).
export class ModAutoplay extends Mod {
  acronym = "AT";
  name = "Autoplay";
  type = ModType.Automation;
  scoreMultiplier = 1.0;
  bit = 0;

  applyToGame(g) { g.autoplay = true; }

  get unranked() { return true; }  // lazer: Autoplay is unranked

  incompatibleWith() { return ["RX", "AP"]; }
}

export default ModAutoplay;
