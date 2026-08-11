import { Mod, ModType } from "../base.js";

// Half Time — lazer: 0.75x speed. Multiplier 0.3.
// Legacy bitmask bit 256.
export class ModHalfTime extends Mod {
  acronym = "HT";
  name = "Half Time";
  type = ModType.DifficultyReduction;
  scoreMultiplier = 0.3;
  bit = 256;

  applyToGame(g) {
    g.daycore = true;  // back-compat: the old code used game.daycore for the 0.75x speed
    g._htSpeed = 0.75;
  }

  applyToAudio(audio) {
    if (audio) audio.playbackRate = 0.75;
  }

  incompatibleWith() { return ["DT"]; }
}

export default ModHalfTime;
