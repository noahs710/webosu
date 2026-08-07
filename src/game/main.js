// webosu ESM game entry. Loading this module runs initgame's side effects
// (sets window.game, loads skin + hitsounds via PIXI.Loader, sets window.Osu /
// window.Playback + the skinReady/soundReady/scriptReady readiness flags), and
// exposes the launchers the inline shell scripts call as window globals.
import "./initgame.js";
import { launchGame, launchReplay } from "./launchgame.js";


window.launchGame = launchGame;
window.launchReplay = launchReplay;
