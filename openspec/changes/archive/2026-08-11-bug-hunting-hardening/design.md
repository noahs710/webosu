## 1. Empty-beatmap guard in `Playback` constructor

`src/game/playback.js` lines 94–104: when `self.hits.length === 0` we set `endTime = 0`, `wait = 0`, `skipTime = 0` and then fall through to the `else` branch which reads `self.hits[self.hits.length - 1].endTime` and `self.hits[0].time`. The fall-through throws `TypeError: Cannot read properties of undefined (reading "endTime")` because both the `if` and the `else` continue executing. The `Playback` constructor then partially-initializes the instance and the game loop tries to drive it with `endTime=0`, which means hits never appear and the user sees a frozen loading screen.

Fix: add `return;` at the end of the empty-hits branch. The constructor now exits cleanly. The empty-hits log is still emitted (`gerror("playback", "empty beatmap — no hit objects")`) so the cause is preserved in the log feed.

## 2. `quitGame` clears stale `window.playback` and `window.game` references

`src/game/launchgame.js` `quitGame` already destroyed the Pixi app and `releaseGlobalResources`, but it left `window.playback` and several `window.game` references pointing at the destroyed scene/cursor. After a `quit`, a follow-up `launchGame` runs `launchOSU(...)`, which checks `if (window.app) return;` and then `var playback = new Playback(window.game, osu, ...)`. The new `Playback` instance assigned `window.playback = this`, but the old `window.game.scene/cursorLayer/cursor/cursorTrail` were still pointing at destroyed Pixi objects; the first `scene.render` call iterated over destroyed children and threw.

Fix: after `window.app = null;`, also null out `window.playback` and the `game.scene / cursorLayer / cursor / cursorTrail / cursorTrailHead` references. The `Playback` constructor will recreate them on the next launch. The block is wrapped in `try/catch` so a partially-initialized `window.game` (e.g. after a failed launch) cannot re-throw during teardown.

## 3. `GET /api/skins/:id` validates the id

`server/app.js` line 520: `parseInt(req.params.id, 10)` silently accepts `"0"`, `"-1"`, `"abc"`, `"1e6"`, `"Infinity"` and returns 0/-1/NaN. `D.getSkin(0)` was returning an empty skin row, and `D.getSkin(NaN)` was returning null (and therefore a 404), but `D.getSkin(-1)` matched a phantom row because the DB layer treated negative integers as a valid id range.

Fix: explicit guard. `if (!isFinite(sid) || sid <= 0) return reply.code(400).send({ error: "invalid id" })`. The 400 short-circuits before `D.getSkin` is called, so the DB layer is never asked for a negative id again. The 404 path for valid-but-missing ids is unchanged.

## 4. `pause()` is null-safe on `self.source`

`src/game/osu-audio.js` line 222: `self.source.stop()` throws if `self.source` is null. The state machine set `self.source = null` after a successful `stop()` but did not reset it after `play()` failed to obtain a buffer, so a retry path could leave the source null. A second `pause()` (e.g. when the user clicks Pause twice) then threw.

Fix: wrap the `stop()` call in a `try { if (self.source) self.source.stop(); } catch (e) {}` and explicitly set `self.source = null` after the call. The state machine is now robust to any call ordering.

## 5. `load_mp3` shim surfaces a foreground popup for missing audio

`src/game/launchgame.js` lines 477–488: the shim's `load_mp3` calls `if (this.onerror) this.onerror(...)` when the audio file is not in the zip. The `osu` facade has `onerror: null` by default, and nothing in the worker-message handler wires an `onerror` callback that surfaces an error to the user. The game sits on a white loading screen with no indication of what went wrong, and the user has to refresh.

Fix: log the error via `lerror("launchgame", ...)` and then call `window.__showErrorPopup(msg, "Missing audio")` if the shell has wired it up. The popup is foreground (z-index 2147483647) and renders above the loading overlay, so the user immediately sees why the beatmap failed to load and can pick a different one.

## Verification

- `node server/test/smoke.js` — 53/53 pass (skin route still 404s on valid-but-missing, now 400s on bad id).
- `node server/test/ws-sse.js` — 15/15 pass (regression-free).
- `node scripts/headless-error-popup.js` — pass, 0 pageerrors.
- `node scripts/headless-quit.js` — 5/5 (no ReferenceError on quit).
- `node scripts/headless-fail-retry.js` — 5/5 (fail→retry→quit still works).
- `node scripts/headless-touch.js` — 5/5 (touch pause button still works after re-launch).
- `node scripts/headless-slider-destroy.js` — pass.
- `node scripts/headless-mod-flashlight.js` / `-fun-all.js` / `-adaptive-speed.js` / `-incompatible.js` / `-transform.js` — all pass.
- `node scripts/headless-gamestate.js` — pass.
- `node scripts/headless-shell.js` / `-settings.js` / `-settings-page.js` / `-settings-migrate.js` / `-perf-hud.js` — all pass.
- `npx vite build` — green.
- `node scripts/headless-play.js` — 0 fatal pageerrors.
- `node scripts/headless-build-play.js` — 0 fatal pageerrors (production build verifies too).

The two known pre-existing failures in `node scripts/headless-integration.js` (approved=0 and replays=0) are unchanged and unrelated to this change.
