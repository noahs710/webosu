# Deep Bug Hunt (post-Phase 5b hardening)

## Why

A follow-up read of the gameplay + shell + server hot paths surfaced a dozen
small, easy-to-miss issues that match the profile of the prior hardening
passes: defensive guards, parseInt/JSON.parse hardening, null-safety, and
foreground error surfaces. None of them crash on a normal session, but each
one would surface as a silent console.error, a broken `?` button, or a
replay that refuses to start under specific user actions or corrupted local
state.

This change folds all of them into a single, low-risk hardening pass so the
"it just works!" promise holds up on every code path the smoke + headless
tests exercise (and on the longer-tail paths they don't, like a corrupt
IndexedDB skin cache or a Web Audio context that never resumed).

## What

Defensive guards across the game, shell, and server layers, with foreground
error popups (where the user is impacted) and dev-mode console warnings
(where the failure is purely cosmetic). No public API change, no schema
migration, no new dependency.

## Capabilities (informative)

- **Robust parsing**: server `/api/comments/:setId` and friends reject
  non-finite / non-positive ids with 400.
- **localStorage hardening**: `api.getUser()` and `getCachedSkinMeta` and
  `loadCachedSkin` wrap `JSON.parse` in try/catch so a corrupt or manually
  edited value never throws.
- **Audio resilience**: `osu-audio.play()` bails cleanly when decodeAudioData
  never produced a buffer (corrupt mp3 / retry exhausted). `osu.onerror` is
  wired up so the `Missing audio` popup surfaces from the launchgame path,
  not just the worker error path.
- **No-track graceful path**: `launchOSU` logs + surfaces a popup if the
  requested difficulty isn't in the .osu, and removes the loading overlay.
- **Score overlay guards**: `setSpriteArrayText/Pos` and `judgementText/Color`
  no longer throw on corrupt data; auto-derive the player username from the
  logged-in webosu_user blob (matches the leaderboard username).
- **Render-loop safety**: per-frame `updateEffects`/`updateBubbles`/overlay
  updates are wrapped so a single bad frame can't kill the whole render
  loop. SliderMesh and Pixi Container destruction unmount cleanly.
- **Vue component lifecycle**: the in-pause-menu ModSelectPanel properly
  unmounts its Vue app when the panel is hidden, so toggling doesn't leak
  detached listeners.
- **Mods panel import error**: surfaces via the foreground error popup so
  the user isn't stuck on a paused screen with a non-functional Mods
  button.

## Impact

- Touches: `server/app.js`, `src/shell/api.js`, `src/game/{osu,osu-audio,
  play-back,launchgame,initgame,playerActions,overlay/score,skin-loader}.js`.
- Tests: smoke (53/53) and ws-sse (15/15) still pass; headless
  error-popup / fail-retry / mod-flashlight / mod-adaptive-speed /
  mod-fun-all / mod-transform / mod-incompatible / settings-page /
  slider-destroy / fail-retry / quit / touch / gamestate / build-play /
  play still pass with 0 pageerrors.
