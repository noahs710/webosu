// Game loader: dynamically imports the Pixi 8 game bundle only when needed.
// Vue pages call ensureGame() before accessing window.launchGame.
let _loaded = false;
export async function ensureGame() {
  if (_loaded || window.launchGame) { _loaded = true; return; }
  await import("/src/game/main.js");
  _loaded = true;
}
