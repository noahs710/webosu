## 1. Empty-beatmap guard

- [x] 1.1 Add `return;` to the empty-hits branch in the `Playback` constructor in `src/game/playback.js`.

## 2. quitGame stale-reference cleanup

- [x] 2.1 Add `window.playback = null;` and the `window.game.scene/cursorLayer/cursor/cursorTrail/cursorTrailHead` reset block in `quitGame` in `src/game/launchgame.js`.
- [x] 2.2 Wrap the reset block in `try/catch` so a half-initialized `window.game` does not re-throw during teardown.

## 3. Skin id validation

- [x] 3.1 Add a `isFinite(sid) && sid > 0` guard before `D.getSkin(sid)` in `GET /api/skins/:id` in `server/app.js`. Return 400 otherwise.

## 4. Audio pause null-safety

- [x] 4.1 Wrap `self.source.stop()` in `try { if (self.source) self.source.stop(); } catch (e) {}` in `pause()` in `src/game/osu-audio.js`.
- [x] 4.2 Set `self.source = null;` after the call so a second `pause()` is also safe.

## 5. Missing-audio popup

- [x] 5.1 In the `load_mp3` shim in `src/game/launchgame.js`, log the error via `lerror` and call `window.__showErrorPopup(msg, "Missing audio")` if available. Fall back to `this.onerror` otherwise.

## 6. Tests and verification

- [x] 6.1 `node server/test/smoke.js` — 53/53 pass.
- [x] 6.2 `node server/test/ws-sse.js` — 15/15 pass.
- [x] 6.3 `node scripts/headless-error-popup.js` — pass, 0 pageerrors.
- [x] 6.4 `node scripts/headless-quit.js` — 5/5 (no ReferenceError on quit).
- [x] 6.5 `node scripts/headless-fail-retry.js` — 5/5 (fail→retry→quit).
- [x] 6.6 `node scripts/headless-touch.js` — 5/5.
- [x] 6.7 `node scripts/headless-slider-destroy.js` — pass.
- [x] 6.8 `node scripts/headless-mod-flashlight.js` / `-fun-all.js` / `-adaptive-speed.js` / `-incompatible.js` / `-transform.js` — all pass.
- [x] 6.9 `node scripts/headless-gamestate.js` — pass.
- [x] 6.10 `node scripts/headless-shell.js` / `-settings.js` / `-settings-page.js` / `-settings-migrate.js` / `-perf-hud.js` — all pass.
- [x] 6.11 `npx vite build` — green.
- [x] 6.12 `node scripts/headless-play.js` — 0 fatal pageerrors.
- [x] 6.13 `node scripts/headless-build-play.js` — 0 fatal pageerrors (production build).

## 7. Documentation

- [x] 7.1 Update `docs/wayfinder/STATUS.md` with a "Hardening pass (post-Phase 5b)" section listing the 5 fixes.

## 8. OpenSpec wrap-up

- [x] 8.1 Archive this change to `openspec/changes/archive/2026-08-11-bug-hunting-hardening/`.
- [x] 8.2 Mark all tasks complete in `tasks.md`.
