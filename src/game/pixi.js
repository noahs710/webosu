// Pixi 8 entry: import the latest pixi.js (v8) and expose it as window.PIXI so the
// (ported) game modules keep using PIXI.* — now backed by v8. Loaded before main.js.
import * as PIXI from "pixi.js";
window.PIXI = PIXI;
