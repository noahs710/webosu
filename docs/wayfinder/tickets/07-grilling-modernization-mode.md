# 07 — grilling: modernization mode

Type: `wayfinder:grilling` (HITL)
Blocks: all later task/prototype tickets (the mode fixes the sequence for everything).
Blocked by: `01-research-render-stack-fps.md`, `03-research-frontend-stack-survey.md`.

## Question

What is the modernization mode for webosu? Pin one:

- **In-place modernize** — keep the game JS largely as-is; modernize build/tooling/deps, package the UI, fix the theme. Lowest risk to the frame budget.
- **Gradual rewrite** — rebuild the UI shell + build pipeline on a modern stack, then port game logic in behind it. Higher effort, cleaner shell.
- **Greenfield rewrite** — rewrite on a new stack, porting gameplay logic. Highest effort and risk to the frame budget.
- **Spec-only** — produce the modernization plan + decision tickets, no code, hand off to execute later.

This is the framing decision for the whole map. Record the chosen mode **and** the explicit reasoning tied to the 60+ FPS-on-cheap-hardware constraint. Once set, it determines whether the render-stack and frontend-stack research feed a migration (in-place) or a rebuild (rewrite), and it sequences every later ticket.



## Resolution (PROVISIONAL — pending user confirmation)

**In-place modernize** is assumed provisionally — the lowest-risk mode for the frame budget, and the one the research so far points to: ticket 03 recommends keeping the MPA with ESM modules (not a rewrite), and ticket 04 shows that a Pixi 8 upgrade would force a rewrite of the perf-critical SliderMesh — i.e. a gradual/full rewrite would spend the highest risk where the FPS constraint is tightest. So the plan modernizes build/deps/theme/ packaging and harvests Pixi-side wins, without a shell rewrite or a greenfield game rewrite.

Consequence: downstream work is a sequenced in-place migration (see MODERNIZATION-PLAN.md), not a rebuild. If the user prefers a gradual rewrite for the shell, only the shell portion of the plan changes; the game side is unaffected.


## Resolution (CONFIRMED by user)

**Gradual rewrite.** Not in-place. The shell and the architecture/stack are rebuilt on a modern foundation and the game engine is **ported in** behind it (not rewritten from scratch — the engine is the working, perf-tuned core). Build/module system modernized; backend modernized (full-stack, ticket 08).

Consequence: ticket 03's shell recommendation moves from "vanilla+ESM in place" to "rebuild the shell with a small component layer (lit/preact) while keeping the MPA and the game page isolated." The plan below is re-derived for gradual rewrite.
