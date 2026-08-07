# 03 — research: frontend UI approach for the shell

Type: `wayfinder:research`
Blocks: `07-grilling-modernization-mode.md`.

## Question

The non-game shell (index, browse, search, hot, new, profile, leaderboard, settings, skins) is plain multi-page HTML + picnic.css + inline `<script>` blocks, sharing `addBeatmapList`, `api.js`, `accounts.js`. Does modernizing it require a framework, and if so which is safe for the frame budget?

Survey minimal options: **vanilla + a signal/store** (no framework), **lit**, **preact**, **solid**, and a keep-vanilla-with-ESM-modules baseline. For each report: bundle weight, runtime cost, dev ergonomics, and the risk that a vdom reconcile / re-render could steal frame time on the game page if a framework were loaded globally. The game page itself should remain framework-free; confirm how to keep the shell and game page isolated.

Recommend an approach and sketch how the shared list/auth code becomes shared ESM modules. Cite primary sources.


## Resolution

Resolved (research). Findings: `research/03-frontend-stack-survey.md`.

**Recommendation:** keep the MPA; no UI framework. Convert the shared shell JS to ESM modules consumed by per-page Vite entries; add a ~30-line signal/store only for the few reactive bits (favorites toggle, search). Keep the game page in a **disjoint code-split bundle** so shell pages never fetch Pixi and the game page never fetches shell UI code. Lowest critical-path cost; directly serves the 60+ FPS goal. If a gradual rewrite is chosen (ticket 07), lit or preact become reasonable for the shell only.


## Addendum (mode confirmed = gradual rewrite)

Under gradual rewrite the shell is rebuilt, so the recommendation upgrades from "vanilla+ESM in place" to:

**Rebuild the shell with a small component layer — lit web components — while keeping the MPA.** Rationale: lit is ~6 KB, has no vdom reconcile loop, and web components compose island-style into MPA pages — zero runtime cost on the game page (which stays a separate Pixi-only entry). preact (~3 KB) is an acceptable alternative if the team prefers JSX. **Do not** introduce an SPA/router that would load framework code on the game page. The isolation invariant stands: the game bundle and shell bundle are disjoint code-split chunks; no shell component imports Pixi; no game module imports a shell component; a shell re-render never runs on the game page. `addBeatmapList`/`api`/`accounts`/`activity` become shared ESM modules consumed by lit components on each shell page.
