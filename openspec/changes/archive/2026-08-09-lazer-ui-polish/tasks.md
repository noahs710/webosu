# Tasks: lazer-ui-polish

## Phase 1: Beatmap card animations (shell)

- [x] T1: Add hover zoom to BeatmapList.vue
  - Cover image scales to 1.05 on hover, 200ms transition
  - Use CSS `transition` + `transform` on the cover `<img>`

- [x] T2: Replace star rings with difficulty color bars
  - Each difficulty gets a colored bar (4px height, rounded)
  - Colors: easy=#62d36b, normal=#4aa3e8, hard=#f5a623, insane=#ff5e8a, expert=#a259d6, expert-plus=#4a4a5a
  - Bars stack horizontally with 2px gap

- [x] T3: Smooth card transitions in styles.css
  - Add `transition: all 200ms ease` to `.beatmap-card.beatmapbox`
  - Ensure no layout shift during hover

## Phase 2: Results screen animations (shell)

- [x] T4: Grade badge bounce-in animation
  - Add `@keyframes gradeReveal` to styles.css: scale 0 → 1.2 → 1.0 over 400ms
  - Apply to `.results-grade` when the `transparent` class is removed

- [x] T5: Staggered stat reveal
  - Add `@keyframes statReveal` to styles.css: opacity 0 → 1, translateY 10px → 0
  - Apply to `.results-stat` with staggered `animation-delay` (0ms, 100ms, 200ms)

- [x] T6: Hit breakdown stagger
  - Apply the same `statReveal` animation to `.hit-stat` with staggered delays (350ms, 500ms, 650ms, 800ms)

## Phase 3: Pause menu polish (shell)

- [x] T7: Pause menu backdrop blur
  - Add `backdrop-filter: blur(8px)` + `-webkit-backdrop-filter: blur(8px)` to `.pause-menu`
  - Fall back to `background: rgba(0,0,0,0.8)` if blur unsupported

- [x] T8: Pause button glow on hover
  - Add `text-shadow: 0 0 12px #ff66aa` on `.pausebutton:hover`
  - Smooth 150ms transition

## Phase 4: Game UI animations (PIXI)

- [x] T9: Judgement pop animation in playback.js
  - In `updateJudgement()`, add scale curve: start at 0.8, overshoot to 1.1 at t=100ms, settle to 1.0 at t=150ms
  - Layer on top of existing alpha fade

- [x] T10: Hit burst particle in playback.js
  - On hit judgement (not miss), create `hitburst.png` sprite at hit position
  - Scale 1.0 → 1.5, alpha 1.0 → 0.0 over 200ms
  - Remove sprite after animation

- [x] T11: Combo color flash in playback.js
  - When combo goes from 0 to 1, create a brief colored circle at hit position
  - Scale 1.0 → 2.0, alpha 0.6 → 0.0 over 100ms
  - Color = current combo color

## Phase 5: Testing

- [x] T12: Verify all animations work without FPS regression
  - Build green, test:game 0 pageerrors
  - No layout shift on card hover
  - Grade badge bounces in
  - Judgements pop on appear
  - Hit bursts appear and fade
  - Pause menu blurs background
