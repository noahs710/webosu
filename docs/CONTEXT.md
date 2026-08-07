# webosu — domain glossary (CONTEXT.md)

This file holds the ubiquitous language for the webosu effort. It is a glossary, not a spec — no implementation details live here. Terms are added as they are resolved during grilling/modeling.

- **webosu** — the project: an unofficial web port of osu! that runs in a browser. Two halves: the non-game shell (browse/search/profile/leaderboard/settings pages) and the game (Pixi-driven playfield + game loop).
- **osu!** — the desktop rhythm game by ppy that webosu ports; the reference behavior for hit timing, scoring, and mods.
- **beatmap** — a playable chart: a `.osu` text file (parsed by `osu.js`) plus audio, packaged in an `.osz`/zip.
- **hit object** — a clickable element on the playfield: circle, slider, or spinner.
- **circle** — a single tap target.
- **slider** — a hit object with a curve the cursor must follow; rendered via `SliderMesh.js` and the `curves/` module.
- **spinner** — a hold-and-rotate hit object.
- **timing point** — a beatmap entry controlling BPM/volume/sample set over a time range.
- **AR / CS / OD / HP** — difficulty scalars: Approach Rate, Circle Size, Overall Difficulty, HP Drain.
- **mod** — a gameplay modifier (e.g. nightcore, hardrock, hidden, no-fail, classic, difficulty-adjust).
- **pp** — performance points, an estimated skill score (server-side `pp.js`).
- **replay** — a recorded input log (cursor + key frames) submitted to the leaderboard and validated server-side by `validate.js`.
- **skin** — a set of textures + hitsounds overriding the default `sprites.json`/`hitsounds/`; imported from `.osk` and stored in localforage.
- **hitsound** — short audio sample played on a hit (normal/soft/drum sets, normal/whistle/finish/clap/tick).
- **leaderboard** — webosu's own per-beatmap score ranking, additive to catboy.best.
- **catboy.best (Mino)** — external beatmap mirror that remains the source of truth for beatmaps/search.
- **frame budget** — the hard performance constraint: stable 60+ FPS on the cheapest Chromebooks / slowest machines. Every modernization decision must preserve it.
- **shell** — the non-game pages (HTML/CSS/JS) wrapping the game.
- **game loop** — the `requestAnimationFrame` loop in `launchgame.js` driving `Playback.render` + cursor + Pixi render.
