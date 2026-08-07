# 09 — grilling: performance budget

Type: `wayfinder:grilling` (HITL)
Blocks: `01-research-render-stack-fps.md`, `02-research-build-tooling.md`, `05-research-theme-system-options.md` (all perf-sensitive research interprets against this budget).

## Question

Define the concrete performance budget that gates every modernization decision. Settle each:

- **Target devices** — which Chromebook tier / minimum specs are the floor? (e.g. N4000-class CPU, 4GB RAM, Intel UHD 600, Chrome 120+.)
- **Minimum sustained FPS** — 60? Is 120+ a stretch goal or out of scope?
- **Frame-time ceiling** — p95/p99 frame time in ms (e.g. 16.6ms p95) and the acceptable dropped-frame rate.
- **Load budgets** — first-contentful-paint, time-to-interactive, total JS bundle / critical-path bytes on the floor device over a slow connection.

This is the yardstick the render-stack, build-tooling, and theme research interpret against, so it should be settled before those run to conclusion. Record the budget as a decision and mirror it into the Notes of the map.


## Resolution (PROVISIONAL — pending user confirmation)

The user has not yet answered the grilling. To keep the map moving, the following budget is assumed provisionally and flagged for confirmation; all perf-sensitive research below interprets against it and must be re-checked if the user revises it.

- **Floor device:** Chromebook-class — Intel Celeron N4000 / N4020, 4 GB RAM, Intel UHD 600, Chrome 120+. This is the slowest tier that should still hit target; anything weaker is best-effort.
- **Minimum sustained FPS:** 60. 120+ is out of scope for the floor device (a stretch goal only for capable hardware).
- **Frame-time ceiling:** p95 <= 16.6 ms; p99 <= 33 ms (no more than ~1 long frame per second); dropped-frame rate < 0.5% on a dense 9* map.
- **Load budgets (floor device, throttled 4G ~1.6 Mbps):** first beatmap time-to-interactive < ~4 s after the player clicks a difficulty; per-shell-page JS on first load <= ~250 KB (gzip); the game bundle (Pixi + game logic) is code-split and fetched only when a map is launched.

This budget is intentionally strict so the research errs toward "do nothing that adds per-frame cost." If the user raises the floor device or relaxes the FPS target, recommendations can loosen accordingly.


## Resolution (CONFIRMED by user)

- **Floor device:** any **2015-or-newer laptop**, and pretty much any desktop. The binding floor is a **low-end 2015 laptop** (e.g. Celeron N3050 / Atom x5, Intel HD Graphics 400/405, 2–4 GB) — weaker than the provisional N4000/UHD-600, so the budget is at least as strict.
- **Minimum sustained FPS:** **60+** on that floor. 120+ remains a stretch goal on capable hardware only.
- **Frame-time ceiling:** p95 ≤ 16.6 ms, p99 ≤ 33 ms, dropped frames < 0.5% on a dense 9\* map.
- **Load:** per-shell-page JS code-split and small (≤ ~250 KB gzip); the game bundle (Pixi + engine) never fetched by shell pages; first beatmap time-to-interactive < ~4 s on throttled 4G.

Consequence: the "stay on Pixi 6 + harvest wins" render recommendation is **strengthened** (a weaker floor makes a SliderMesh/Pixi-8 rewrite riskier). The benchmark target device (ticket 01 / bench.html) is now a 2015 low-end laptop.
