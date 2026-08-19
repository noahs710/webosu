// Lazer HP drain/gain tables for osu! ruleset.
// Ported from osu.Game.Rulesets.Osu/Scoring/OsuHealthProcessor.cs + IBeatmapDifficultyInfo.cs
// The DifficultyRange is a two-piece linear function: 0->min, 5->mid, 10->max.

// lazer IBeatmapDifficultyInfo.DifficultyRange(difficulty, min, mid, max)
// 0-5: mid + (mid - min) * (difficulty - 5) / 5
// 5-10: mid + (max - mid) * (difficulty - 5) / 5
export function lazerDifficultyRange(difficulty, min, mid, max) {
  if (difficulty > 5) return mid + (max - mid) * (difficulty - 5) / 5;
  if (difficulty < 5) return mid + (mid - min) * (difficulty - 5) / 5;
  return mid;
}

// Lazer OsuHealthProcessor.getHealthIncreaseFor — per-judgement HP deltas.
// These are the lazer values (not the stable approximation).
export function lazerHpIncrease(resultType, hpDrain, hitObject) {
  const dr = hpDrain;
  switch (resultType) {
    // Misses (difficulty-scaled)
    case "SmallTickMiss":
    case "LargeTickMiss":
      return lazerDifficultyRange(dr, -0.02, -0.075, -0.14);
    case "Miss":
      return lazerDifficultyRange(dr, -0.03, -0.125, -0.2);

    // Tick hits (flat)
    case "SmallTickHit":  // slider tail in classic mode
      return 0.02;
    case "SliderTailHit":
    case "LargeTickHit":
      if (hitObject === "SliderTick") return 0.015;
      // SliderHeadCircle, SliderTailCircle, SliderRepeat
      return 0.02;

    // Main judgements (flat)
    case "Meh":   // 50
      return 0.002;
    case "Ok":    // 100
      return 0.011;
    case "Great": // 300
      return 0.03;

    // Bonus
    case "SmallBonus":
      return 0.0085;
    case "LargeBonus":
      return 0.01;

    default:
      return 0;
  }
}

// Last-in-combo bonus: lazer adds +0.07 (perfect combo) / +0.05 (good) / +0.03 (none)
// on the last hit object of a combo when it's hit.
export const LAZER_LAST_COMBO_BONUS = {
  Perfect: 0.07,
  Good: 0.05,
  None: 0.03,
};

// Lazer hit windows (osu! ruleset) — OsuHitWindows.cs
// Wiki-anchored (osu.ppy.sh/wiki/en/Gameplay/Judgement/osu!):
//   great = 80 - 6*OD    (hit value 300, acc 100%)
//   ok    = 140 - 8*OD   (hit value 100, acc 33.33%)
//   meh   = 200 - 10*OD  (hit value 50, acc 16.67%)
//   miss  = 400 (constant in lazer; was 400 - 6*OD in pre-2020 stable)
// The ppy/osu source (OsuHitWindows.cs) uses a two-piece DifficultyRange form
// and a -0.5 boundary shift internally. The two forms match at OD∈{0,5,10}
// and differ by up to ~5 ms elsewhere; the linear form is the player-facing
// wiki value.
export const LAZER_MISS_WINDOW = 400;

// Source-cited two-piece form (matches ppy/osu OsuHitWindows.cs at the boundary).
// Wiki-anchored linear form (80 - 6*OD, 140 - 8*OD, 200 - 10*OD) was previously
// exported as `lazerHitWindowsLinear` but had zero production callers — removed
// in M1.6. The wiki form is the canonical player-facing value; the two-piece
// form is what ppy/osu source actually computes, and matches the wiki form at
// OD ∈ {0, 5, 10} (boundary points).
export function lazerHitWindows(od) {
  return {
    great: Math.floor(lazerDifficultyRange(od, 80, 50, 20)) - 0.5,
    ok: Math.floor(lazerDifficultyRange(od, 140, 100, 60)) - 0.5,
    meh: Math.floor(lazerDifficultyRange(od, 200, 150, 100)) - 0.5,
    miss: LAZER_MISS_WINDOW,
  };
}

// Lazer spinner clear/complete RPM — Spinner.cs
// Wiki-anchored (osu.ppy.sh/wiki/en/Gameplay/Judgement/osu!):
//   minSpinsPerSec = OD < 5 ? 1.5 + 0.2*OD : 1.25 + 0.25*OD
//   minSpins      = spinnerLengthSec * minSpinsPerSec + 0.5
// Spins are counted in half-revolutions internally.
// The ppy/osu source uses DifficultyRange(OD, 90, 150, 225) for "clear" RPM
// and DifficultyRange(OD, 250, 380, 430) for "complete" RPM; these are the
// 60× revolutions-per-minute equivalent of the wiki's spins-per-second.
export function lazerSpinnerMinSpinsPerSec(od) {
  return od < 5 ? 1.5 + 0.2 * od : 1.25 + 0.25 * od;
}

export function lazerSpinnerMinSpins(od, lengthSec) {
  return lengthSec * lazerSpinnerMinSpinsPerSec(od) + 0.5;
}

export function lazerSpinnerRpm(od) {
  return {
    clear: lazerDifficultyRange(od, 90, 150, 225),
    complete: lazerDifficultyRange(od, 250, 380, 430),
  };
}

export default {
  lazerDifficultyRange,
  lazerHpIncrease,
  LAZER_LAST_COMBO_BONUS,
  LAZER_MISS_WINDOW,
  lazerHitWindows,
  lazerSpinnerRpm,
  lazerSpinnerMinSpinsPerSec,
  lazerSpinnerMinSpins,
};