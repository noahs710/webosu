import { Mod, ModType } from "../base.js";

// Double Time — lazer: 1.5x speed, no pitch shift. Multiplier 1.12.
// Legacy bitmask bit 64 (shared with NC in the old code; DT is the base).
export class ModDoubleTime extends Mod {
  acronym = "DT";
  name = "Double Time";
  type = ModType.DifficultyIncrease;
  scoreMultiplier = 1.12;
  bit = 64;

  applyToGame(g) {
    g.doubletime = true;
    // back-compat: the old code used game.nightcore for the 1.5x speed;
    // DT now owns the speed. The old flag stays false unless NC is also active.
    g._dtSpeed = 1.5;
  }

  applyToAudio(audio) {
    if (audio) audio.playbackRate = 1.5;
  }

  incompatibleWith() { return ["HT"]; }
}

export default ModDoubleTime;
