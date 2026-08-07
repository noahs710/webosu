# Research 03 — Frontend UI approach for the shell

Scope: the nine non-game pages (index, browse, search, hot, new, profile, leaderboard, settings, skins) and their shared code (`addBeatmapList.js`, `api.js`, `accounts.js`, `activity.js`). The **game page is out of scope for any framework** — it must stay Pixi + vanilla in its own module graph, isolated from the shell so a shell re-render can never touch the game loop.

## Current state (evidence)

- Multi-page architecture (MPA): each page is a full HTML doc with its own `<script>` bootstrap; navigation is real page loads, not client routing. Good for perf (small per-page JS, streaming HTML) and SEO.
- Shared logic is plain `<script>`-loaded JS mutating global state (`window.liked_sid_set`, `window.localforage`, `window.WebosuAPI`). No build step, no modules.
- `addBeatmapList.js` (16KB) builds beatmap cards by string-concatenating HTML and injecting `innerHTML` — the dominant shell workload.

## Constraint framing

The FPS risk from a framework is **not** on the game page (it stays Pixi-only) — it's (a) extra JS bytes on the critical path of every shell page, and (b) the temptation to turn the MPA into an SPA, which would load a router + framework on the game page too. The right frame is: keep the MPA, share code via ESM modules, and only add reactivity where a page actually needs it (favorites toggle, search).

## Options

| Approach | Bundle on shell | Runtime cost | Dev ergonomics | FPS risk | Fit |
|---|---|---|---|---|---|
| **Vanilla + ESM modules + tiny signal store** | ~0 | none | good with Vite HMR | none | **Recommended** |
| lit | ~6KB | small (lit-html) | good | none on game (isolated) | fine, slightly more than needed |
| preact | ~3KB | small vdom | good | low if isolated | fine |
| solid | ~7KB | none (compiled) | good | low | fine, build-step dependent |
| SPA (react/router) | 40KB+ | medium | high | **high** if loaded on game page; MPA lost | not recommended |

All framework options can be made FPS-safe **only by keeping the game page framework-free**. Given the shell's workload is mostly list rendering of beatmap cards (which is already fine as `innerHTML` injection) and a few toggles, a framework buys little and costs critical-path bytes.

## Recommendation

**Vanilla + ESM, MPA preserved, no framework.** Concretely:
1. Keep the multi-page architecture. Each page stays its own HTML doc; navigation stays real loads (best for first-paint on the floor device and for not loading game deps on shell pages).
2. Convert `addBeatmapList.js`, `api.js`, `accounts.js`, `activity.js` to ESM modules (`export function addBeatmapList(...)`) consumed by small per-page entry modules bundled by Vite (ticket 02).
3. For the few reactive bits (favorites heart toggle, search input), a ~30-line signal/store helper (subscribe/notify) is enough — no framework.
4. Keep the game page (`launchgame.js`/`initgame.js`/`playback.js`/`SliderMesh.js`) in its **own bundle chunk**, code-split so shell pages never fetch Pixi, and the game page never fetches shell framework code.

This matches the in-place-modernize mode and keeps zero runtime cost on the critical path — directly serving the 60+ FPS goal on cheap hardware. (If the user picks a gradual rewrite in ticket 07, lit or preact become reasonable for the shell only; the recommendation above is the minimum-risk default.)

## Isolation invariant to record

> The game page bundle and the shell bundle must be disjoint code-split chunks. No shell module may import Pixi; no game module may import a shell UI framework. A shell re-render must never run on the game page.
