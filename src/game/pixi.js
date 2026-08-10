// Pixi 8 entry: import the latest pixi.js (v8) and expose it as window.PIXI so the
// (ported) game modules keep using PIXI.* — now backed by v8. Loaded before main.js.
import * as PIXI from "pixi.js";
import "pixi.js/prepare"; // enables renderer.prepare.upload per pixijs-performance skill
window.PIXI = PIXI;
