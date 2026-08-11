# Game state robustness

## MODIFIED Requirements

### R-GS-001: Defensive input parsing (server)
The server MUST validate path parameters that are used as sqlite row
keys. `setId` on `/api/comments/:setId` MUST be a finite positive integer;
non-integer values MUST return 400 with `{ "error": "invalid setId" }`.

### R-GS-002: Defensive localStorage parsing (client)
Any code that reads `localStorage.getItem("webosu_user")` or
`localStorage.getItem("username")` MUST wrap `JSON.parse` in try/catch
and treat any failure (or non-object result) as "no user logged in".
Similarly, any code that reads an IndexedDB config blob via
`getCachedSkinMeta` or `loadCachedSkin` MUST treat a corrupt config
JSON as "no config" rather than rejecting the load.

### R-GS-003: Audio decode robustness
`OsuAudio.play()` MUST return `false` (not throw) when `self.decoded` is
null. The `Playback` constructor MUST install an `osu.onerror` handler
that surfaces a foreground ErrorPopup with title "Missing audio" so a
corrupt or missing mp3 doesn't leave the user stuck on a loading menu.

### R-GS-004: No-track graceful path
`launchOSU` MUST show a foreground ErrorPopup and remove the
`#beatmap-loading-overlay` element when the requested difficulty id or
version isn't in the .osu set. It MUST log the available tracks so
the dev can reproduce.

### R-GS-005: Render-loop safety
Each per-frame overlay update in `Playback.render` MUST be wrapped in
try/catch so a corrupt hit object or overlay can kill one frame but not
the whole render loop. The user sees a momentary glitch, not a frozen
canvas.

### R-GS-006: Render helper defensive coding
`setSpriteArrayText`, `setSpriteArrayPos`, `judgementText`, and
`judgementColor` MUST NOT throw on unexpected input. Unknown points
values fall back to a 50-equivalent ("meh" text, 0xffcc22 color) so a
future lazer judgement routed through the existing path is safe.

### R-GS-007: Summary user resolution
`showSummary` MUST resolve the player username from
`localStorage.getItem("webosu_user")` (the same source the leaderboard
uses) with fallback to `localStorage.getItem("username")` and finally
`metadata.Player`. The summary MUST also coerce `BeatmapSetID` /
`BeatmapID` to integers and fall back to empty strings for missing
title/artist metadata so the discord webhook payload is always valid.

### R-GS-008: Play history persistence
`addPlayHistory` MUST persist to `localforage["playhistory1000"]` if
available, and fall back to `localStorage["playhistory1000"]` otherwise.
`initgame.js` MUST mirror the same fallback when restoring history on
launch.

### R-GS-009: AudioContext resume robustness
The hitsound `AudioContext.resume()` call MUST be wrapped in try/catch
and a `.catch(() => {})` on the returned promise. The first-user-gesture
listener MUST also be registered on `touchend` (in addition to
`pointerdown` / `keydown`) for touch devices without a keyboard.

### R-GS-010: Mods panel lifecycle
The in-pause-menu ModSelectPanel MUST be properly unmounted (Vue
`app.unmount()`) when the panel is hidden. Repeated open/close MUST
NOT leak detached Vue apps or listeners. An import failure MUST
surface via the foreground ErrorPopup.
