## Why

The shell UI (beatmap cards, nav, results screen, pause menu) is functional but visually flat compared to osu!lazer. The game UI (judgements, hit bursts) lacks the pop and animation that makes osu!lazer feel alive. This change polishes both layers to match the osu!lazer desktop client's visual fidelity.

## What Changes

- **Animated beatmap cards**: Hover zoom on cover image, difficulty color bars beneath the card, smooth transition on mouse enter/leave
- **Results screen grade reveal**: Animated grade badge that scales in with a bounce, score counting animation, staggered stat reveal
- **Pause menu backdrop blur**: `backdrop-filter: blur()` on the pause overlay, animated button hover with glow
- **Judgement pop animation**: Scale bounce on appear (300→1.0 scale over 150ms with overshoot), current fade stays
- **Hit burst particles**: `hitburst.png` sprite that scales up and fades on hit, matching osu!lazer's impact effect
- **Slider ball tinting**: When `skin.ini` `AllowSliderBallTint` is enabled, tint the slider ball with the current combo color
- **Combo color burst**: Brief flash of the combo color when a new combo starts

## Capabilities

### New Capabilities
- `animated-beatmap-cards`: Beatmap card hover animations (zoom, difficulty bars, smooth transitions)
- `results-screen-animations`: Grade reveal bounce, score counting, staggered stat reveal on the results screen
- `judgement-animations`: Pop/bounce scale animation on judgement appear, hit burst particle effect

### Modified Capabilities
- `game-cursor`: Cursor expand animation refined to match osu!lazer feel (smoother easing)

## Impact

- `src/vue/components/BeatmapList.vue`: Card hover animations, difficulty color bars
- `src/vue/styles.css`: Results screen animations, pause menu blur, card transitions
- `src/game/playback.js`: Judgement pop animation, hit burst particles, combo color burst
- `src/game/launchgame.js`: Pause menu backdrop blur (CSS class toggle)
- `src/game/overlay/score.js`: Results screen grade reveal animation
