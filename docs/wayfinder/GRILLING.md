# Grilling sheet — RESOLVED

All three HITL decisions are confirmed by the user. See [MAP.md](wayfinder/MAP.md) and [MODERNIZATION-PLAN.md](wayfinder/MODERNIZATION-PLAN.md).

- **Perf budget:** 60+ FPS on any 2015-or-newer laptop and any desktop. (binding floor = low-end 2015 Celeron/Atom + Intel HD graphics)
- **Mode:** gradual rewrite (rebuild shell + stack, port the game engine in).
- **Scope:** full-stack, constrained to run on Fly.io alone (Fastify + node:sqlite + ws, single process + volume).

Remaining gate is not a decision: run [`bench.html`](../../bench.html) on a real 2015 low-end laptop to lock the render choice (Phase 6). Phases 1–5 proceed regardless.
