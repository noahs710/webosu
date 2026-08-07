# 01 — research: render stack vs FPS

Type: `wayfinder:research`
Blocks: `07-grilling-modernization-mode.md` (the mode decision needs to know if Pixi can stay).
Blocked by: `09-grilling-perf-budget.md` (interpret results against the budget).

## Question

Which rendering approach keeps webosu inside the frame budget on the cheapest Chromebooks while modernizing? Compare, against the agreed perf budget:

- (a) **Stay on Pixi 6.5.10** — no renderer change, just packaging.
- (b) **Upgrade Pixi 6 -> 8** — see `04-research-pixi-migration-path.md` for the concrete change list.
- (c) **Raw Canvas2D** — drop Pixi, hand-render the playfield.
- (d) **Raw WebGL/WebGL2** — drop Pixi, hand-render with custom shaders (sliders, approach circles, cursor trail).
- (e) **WebGPU** — note device support on the floor Chromebook tier (likely a non-starter; record why).

For each, report: estimated FPS / frame-pacing on the floor device, bundle size delta, migration cost from the current Pixi API surface (`SliderMesh.js`, spritesheet/`sprites.json`, `InteractionManager`, `Loader`, `AlphaFilter`/`BlurFilter` background, `autoDensity`/resolution), and residual risk to the budget.

A real low-end Chromebook is not available here, so deliver (1) a **reproducible benchmark harness** that can be run on the target device (synthetic hit-object workload matching webosu's real circle/slider counts at 9*+ density), and (2) **provisional findings** reasoned from the codebase's actual rendering workload and Pixi 6->8 release notes. Cite primary sources (Pixi release notes/issues, Chrome hardware perf data).


## Resolution (PROVISIONAL — depends on benchmark confirmation on the real floor device)

Findings: `research/01-render-stack-fps.md`. **Recommendation:** stay on Pixi 6.5.10 and harvest wins that don't touch SliderMesh — the biggest being **disable Pixi's InteractionManager** (gameplay input comes from window pointer events, so the per-frame hit-testing is pure overhead), plus object pooling, cursor-trail z-order fix, cheaper background blur, and lazy-loading Pixi via code-splitting. Upgrade to Pixi 8 / raw-WebGL slider path only if a measured win on the floor device (via the specified benchmark harness) justifies the SliderMesh rewrite risk. Reject Canvas2D and WebGPU for the floor tier. The decision locks only after the benchmark harness runs on the real Chromebook.
