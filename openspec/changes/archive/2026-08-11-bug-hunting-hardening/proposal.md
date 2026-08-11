## Why

After the deep `deepen-game-state-seam` change shipped, a careful read-through of the gameplay + shell hot paths surfaced five more issues that share the same profile as our prior hardening passes: small, easy-to-miss, but capable of crashing the game or showing silent failures when triggered by real users. None of them affect a happy-path play, but each of them is reachable through a normal user action (relaunching a beatmap, loading a beatmap without its audio file, opening a deep link to a skin that does not exist). The pattern we have established — log + guard + foreground error popup — still applies. This change finishes the hardening pass so the experience is "it just works" rather than "works until you do X".

## What Changes

- `src/game/playback.js` — the empty-beatmap branch in the `Playback` constructor now `return`s instead of falling through. Previously the fall-through dereferenced `self.hits[0].time` and threw a `TypeError`, crashing the game before any of the loading UI was wired up.
- `src/game/launchgame.js` — `quitGame` now clears `window.playback` and resets the `window.game.scene/cursorLayer/cursor/cursorTrail/cursorTrailHead` references. Previously a follow-up `launchGame` could trip on stale references, and a failed launch left a half-initialized `window.app` for the next attempt.
- `server/app.js` — `GET /api/skins/:id` now validates the id is a finite positive integer and returns 400 otherwise. Previously `parseInt` accepted arbitrary strings (e.g. `0`, `-1`, `1e6`, `Infinity`).
- `src/game/osu-audio.js` — `pause()` is now null-safe on `self.source`. Previously a second `pause()` would throw `TypeError: Cannot read properties of null`.
- `src/game/launchgame.js` — the `load_mp3` shim in the worker-message handler now surfaces a foreground `__showErrorPopup` with title "Missing audio" when the audio file is missing from the beatmap. Previously the silent `this.onerror` was unreachable, and the game sat on a white loading screen until the user pressed Escape.

**BREAKING**: None. All fixes are defensive guards; no public API or DB schema changes.

## Capabilities

### Modified Capabilities
- `game-state` — The `game.scene/cursorLayer/cursor/cursorTrail` reset on `quitGame` aligns `window.game` with the empty-state we expect before `launchOSU` runs `initgame.js`. The seam stays consistent across launches.
- `mod-settings-bridge` — no functional change, but the empty-beatmap return in `playback.js` removes a class of crash that was otherwise hidden behind the mod settings bridge; mods that need a clean playback now have a clean handoff even for an empty beatmap.

## Impact

- `src/game/playback.js` — one-line addition (`return;`) in the empty-hits branch of the `Playback` constructor.
- `src/game/launchgame.js` — three lines added in `quitGame` and a `__showErrorPopup` call in the `load_mp3` shim. Backward compatible: the error surface is opt-in via the existing `window.__showErrorPopup` helper.
- `server/app.js` — one-line guard before `D.getSkin(sid)`; returns 400 on invalid id. 404 for valid id but no row is unchanged.
- `src/game/osu-audio.js` — three lines added (try/catch + null assignment) in `pause()`. No API change.
