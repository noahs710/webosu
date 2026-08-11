import { Mod, ModType } from "../base.js";

// Flashlight — lazer: dark overlay with a circular viewport around the cursor
// that shrinks with combo and dims further during sliders.
// Multiplier 1.12. Legacy bitmask bit 4 (osu! stable FL bit).
export class ModFlashlight extends Mod {
  acronym = "FL";
  name = "Flashlight";
  type = ModType.DifficultyIncrease;
  scoreMultiplier = 1.12;
  bit = 4;
  defaultSettings = {
    // lazer FlashlightSize curve: radius in osu! pixels at combo 0, 100, 200+
    sizeCombo0: 400,    // ~400px at combo 0
    sizeCombo100: 300,  // ~300px at combo 100
    sizeCombo200: 250,  // ~250px at combo 200+ (minimum)
    sliderDim: 0.3,     // additional dim alpha while following a slider
  };

  applyToGame(g) { g.flashlight = true; }
}

export default ModFlashlight;