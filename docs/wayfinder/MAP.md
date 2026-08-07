# webosu modernization — wayfinder map

Label: `wayfinder:map` (local-markdown tracker; no hosted issue tracker configured for this repo).
Child tickets live in `docs/wayfinder/tickets/NN-<type>-<slug>.md`; research findings in `docs/wayfinder/research/`.

## Destination

A fully-decided modernization plan for webosu: dependencies, build tooling, module/architecture, frontend stack, rendering approach, theme system, and backend — **ready to hand off to execution as a sequenced build**. Every decision must preserve the hard constraint: **stable 60+ FPS on any 2015-or-newer laptop and any desktop**. The map is done when the way from "basic HTML/CSS/JS + hand-vendored libs + require.js + Pixi 6" to that plan is clear and nothing remains undecided before someone goes and does the work.

## Notes

- **Domain:** browser rhythm game — an unofficial web port of osu!. Gameplay is timing-critical and rendering-bound; input latency and frame pacing matter more than dev ergonomics. See `docs/CONTEXT.md`.
- **Hard constraint (gates every decision):** 60+ FPS on the floor device. No decision that risks the frame budget ships.
- **Confirmed budget (ticket 09):** floor = any 2015+ laptop (binding = low-end 2015 Celeron/Atom + Intel HD graphics) and any desktop; p95 ≤ 16.6 ms; shell JS code-split ≤ ~250 KB gzip; game bundle never fetched by shell pages.
- **Confirmed mode (ticket 07):** gradual rewrite — rebuild the shell + architecture/stack, port the game engine in behind it.
- **Confirmed scope (ticket 08):** full-stack, constrained to run on Fly.io alone (single Node process + mounted volume + built-in `node:sqlite`, no external DB/infra).
- **Must preserve:** catboy.best as beatmap source of truth; additive webosu backend; PWA/offline shell + localforage storage; `.osk` skin + custom hitsound import; the game engine's behavior (ported, not rewritten).

## Decisions so far

- [09 Performance budget](tickets/09-grilling-perf-budget.md) — **DECIDED** 60+ FPS on any 2015+ laptop / any desktop; p95 ≤ 16.6 ms; shell JS code-split; game bundle isolated.
- [07 Modernization mode](tickets/07-grilling-modernization-mode.md) — **DECIDED** gradual rewrite (port the engine in, rebuild the shell).
- [08 Backend scope](tickets/08-grilling-backend-scope.md) — **DECIDED** full-stack on Fly.io alone (Fastify + node:sqlite + ws, single process + volume).
- [03 Frontend UI approach](tickets/03-research-frontend-stack-survey.md) — rebuild the shell with lit web components (or preact), keep the MPA; game page a disjoint Pixi-only code-split bundle.
- [04 Pixi 6 -> 8 migration path](tickets/04-research-pixi-migration-path.md) — not a version bump: SliderMesh reaches into v6 internal renderer APIs; Loader->Assets, autoResize->resizeTo; disable Pixi InteractionManager is a free win on v6 today.
- [06 Dependency audit](tickets/06-research-dep-audit.md) — drop underscore/vercel/inflate/z-worker; zip->fflate, sound.js->howler/native, require->ESM; keep node:sqlite/ws/bcryptjs; hold mp3parse; Express->Fastify (full-stack).
- [01 Render stack vs FPS](tickets/01-research-render-stack-fps.md) — **BENCHMARK-GATED** stay on Pixi 6 + harvest wins (disable interaction, ring buffer, pooling, trail fix, cheaper blur); escalate to Pixi 8/raw-WebGL slider rewrite only if bench fails on the 2015 floor device. Reject Canvas2D & WebGPU for the floor tier.
- [02 Build tooling & modules](tickets/02-research-build-tooling.md) — Vite (frontend) + Fastify (backend) in one repo; ESM; delete jsloader/require.js + urlArgs cache-bust; code-split the game bundle; SW precache moves to build-manifest hashed list.
- [05 Theme system](tickets/05-research-theme-system-options.md) — drop picnic; plain CSS `@layer` + `:root` design tokens for the lazer palette; dark mode as token swap; game page on a separate minimal stylesheet; self-host Comfortaa woff2.

The synthesized, sequenced execution plan: [`MODERNIZATION-PLAN.md`](MODERNIZATION-PLAN.md).

## Not yet specified

- **Benchmark confirmation on a real 2015 low-end laptop** — ticket 01's harness (`bench.html`) must run on the floor device before "stay on Pixi 6" vs "rewrite slider for Pixi 8" locks. The recommendation is provisional until measured (Phase 6).
- **mp3parse replacement** — its ID3/Xing offset logic is load-bearing for audio sync; a safe swap needs a parity check against current offset values. Graduate when Phase 4 begins.
- **lit vs preact for the shell** — ticket 03 picks lit as default; final call can wait until Phase 3 scaffolding (both satisfy the isolation invariant).

## Out of scope

- **External DB / multi-process infra** — ruled out by the Fly.io-alone constraint (keep `node:sqlite` on the mounted volume).
- **120+ FPS / high-refresh targets** — out of scope for the floor device; stretch only on capable hardware.
- **A UI framework on the game page** — ruled out by the isolation invariant: no shell UI code on the game page, ever.
- **A from-scratch game-engine rewrite** — the engine is ported intact; only the slider renderer is conditionally rewritten (Phase 6, benchmark-gated).
