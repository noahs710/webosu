import { Mod, ModType } from "../base.js";

// Relax — lazer: auto-click on cursor-over-hitobject, no keypress required.
// Unranked (0x multiplier). No legacy bit.
export class ModRelax extends Mod {
  acronym = "RX";
  name = "Relax";
  type = ModType.Automation;
  scoreMultiplier = 0.0;
  bit = 0;

  applyToGame(g) { g.relax = true; }
  get unranked() { return true; }

  incompatibleWith() { return ["AT", "AP"]; }
}

export default ModRelax;
