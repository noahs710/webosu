import { Mod, ModType } from "../base.js";

// AutoPilot — lazer: auto-cursor to each hitobject, player presses keys.
// Unranked (0x multiplier). No legacy bit.
export class ModAutoPilot extends Mod {
  acronym = "AP";
  name = "AutoPilot";
  type = ModType.Automation;
  scoreMultiplier = 0.0;
  bit = 0;

  applyToGame(g) { g.autopilot = true; }
  get unranked() { return true; }

  incompatibleWith() { return ["AT", "RX"]; }
}

export default ModAutoPilot;