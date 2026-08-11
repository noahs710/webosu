# Tasks

- [x] Audit codebase for unguarded `parseInt`, `JSON.parse`, and array
      accesses that could throw.
- [x] `/api/comments/:setId` validates setId (server/app.js).
- [x] `api.getUser` parse-hardens the user blob (shell/api.js).
- [x] `osu.js` length fallback for empty hitObjects.
- [x] `launchgame.js` `requestStar` JSON.parse try/catch.
- [x] `launchgame.js` `launchOSU` defensive track-id search + popup.
- [x] `launchgame.js` `quitGame` wraps gamesettings.loadToGame in
      try/catch.
- [x] `launchgame.js` `launchGame` arrayBuffer hardening + popup.
- [x] `initgame.js` `actx.resume` try/catch + touchend fallback.
- [x] `initgame.js` play history localStorage fallback.
- [x] `osu-audio.js` `play()` null-safe on `self.decoded`.
- [x] `playback.js` `osu.onerror` surface popup.
- [x] `playback.js` `osu.onready` start() try/catch.
- [x] `playback.js` `load()` try/catch around `load_mp3`.
- [x] `playback.js` `judgementText/Color` no-throw.
- [x] `playback.js` `playHitsound` per-sample null-safety + try/catch.
- [x] `playback.js` render-loop per-frame try/catch.
- [x] `playback.js` Mods panel Vue app unmount on close + import error
      popup.
- [x] `playback.js` Adaptive Speed source.playbackRate try/catch.
- [x] `score.js` summary user from webosu_user + id coercion + title
      fallbacks.
- [x] `score.js` `addPlayHistory` localforage + localStorage fallback.
- [x] `score.js` submitScore error surfaced via popup.
- [x] `score.js` `setSpriteArrayText/Pos` defensive.
- [x] `playerActions.js` `inUpcoming[_grace]` type checks.
- [x] `skin-loader.js` `getCachedSkinMeta` + `loadCachedSkin` parse
      hardening.
- [x] Run smoke (53/53) and ws-sse (15/15).
- [x] Run headless error-popup, fail-retry, mod-flashlight, mod-adaptive-
      speed, mod-fun-all, mod-transform, mod-incompatible, settings-page,
      touch, gamestate, quit, slider-destroy, build-play, play, perf-hud
      — all 0 pageerrors.
- [x] Update `docs/wayfinder/STATUS.md` with the new section.
- [x] Commit + push.
