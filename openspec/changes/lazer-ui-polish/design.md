## Context

The shell UI uses Vue 3 + Tailwind CSS. Beatmap cards are static with a simple hover transform. The results screen is a CSS overlay with a circular grade badge that appears instantly. The pause menu is a semi-transparent overlay without blur. Game judgements fade in/out but don't pop or bounce. Hit bursts are a static sprite with no animation.

osu!lazer's UI feels alive because every element has motion: cards zoom on hover, the grade badge bounces in, the pause menu blurs the background, judgements pop with a scale bounce, and hit bursts explode outward.

## Goals

1. **Beatmap cards** that feel responsive: hover zoom, difficulty color bars, smooth transitions
2. **Results screen** that feels rewarding: grade badge bounces in, score counts up, stats stagger in
3. **Pause menu** that feels polished: backdrop blur, button glow on hover
4. **Judgements** that feel impactful: scale pop on appear, hit burst particle
5. **Combo color** feedback: brief flash when a new combo starts

## Non-Goals

- No new game mechanics
- No changes to gameplay logic (hit timing, scoring, HP drain)
- No skin system changes (that's the osk-skin-support change)
- No new pages or routes

## Decisions

### D1: CSS animations for shell UI, PIXI animations for game UI
**Decision**: Use CSS transitions/keyframes for beatmap cards, results screen, and pause menu (DOM elements). Use PIXI transform animations (scale, alpha, rotation) for judgements and hit bursts (canvas elements).
**Rationale**: Shell UI is DOM-based (Vue + Tailwind) — CSS animations are natural. Game UI is PIXI canvas-based — PIXI transforms are the only option.
**Alternative**: Use a JS animation library (GSAP, anime.js) — overkill for these simple effects.

### D2: CSS keyframes for grade reveal
**Decision**: Define `@keyframes gradeReveal` in `styles.css` that scales from 0 to 1.2 to 1.0 with a bounce. Apply to `.results-grade` on mount.
**Rationale**: The results screen is a DOM overlay. CSS keyframes are the simplest way to animate a DOM element on mount.
**Alternative**: JS-driven animation (more complex, no benefit for a one-shot animation).

### D3: Judgement pop uses existing animation system
**Decision**: Modify the existing `updateJudgement()` function to add a scale pop at the start of the animation. The current fade in/out stays; a scale curve is added on top.
**Rationale**: The judgement animation is already managed per-frame in `updateJudgement()`. Adding a scale curve is a small change to the existing code.
**Alternative**: Use PIXI.Ticker or a separate animation system (unnecessary complexity).

### D4: Hit burst as a separate sprite
**Decision**: When a hit is judged, create a temporary `hitburst.png` sprite that scales from 1.0 to 1.5 and fades from 1.0 to 0.0 over 200ms. Remove after animation.
**Rationale**: osu!lazer shows a burst effect on hit. The `hitburst.png` texture already exists in the spritesheet. Creating a temporary sprite is cheap and self-cleaning.
**Alternative**: Use PIXI particles (overkill for a single sprite).

## Risks / Trade-offs

- [CSS backdrop-filter (blur) may not work on all browsers] → Use `-webkit-backdrop-filter` prefix; fall back to semi-transparent background if unsupported
- [Animations may impact FPS on low-end devices] → Keep animations short (150-300ms), use transform/opacity (GPU-accelerated), avoid layout thrashing
- [Grade reveal animation may conflict with the transparent class toggle] → Ensure the animation starts after the `transparent` class is removed

## Open Questions

- Should the score counting animation use a requestAnimationFrame loop or CSS counter? (RAF is more reliable for large numbers)
- Should hit burst particles be pooled to avoid GC pressure? (Probably not needed for short-lived single sprites)
