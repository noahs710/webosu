// Pure-math mirror of the lazer Score V2 typed pipe in overlay/score.js.
// Kept dependency-free (no PIXI) so property tests can run in Node.
// If you change score.js's scoreTyped / RESULT tables, update this to match.

export const RESULT_BASE = {
   Great: 300, Perfect: 300, Good: 200, Ok: 100, Meh: 50,
   SliderTailHit: 150, LargeTickHit: 30, SmallTickHit: 10,
   LargeBonus: 50, SmallBonus: 10,
   Miss: 0, LargeTickMiss: 0, SmallTickMiss: 0, IgnoreMiss: 0, IgnoreHit: 0,
};

export const RESULT_ACCURACY = new Set([
   "Great", "Ok", "Meh", "Miss",
   "SliderTailHit", "IgnoreMiss",
   "LargeTickHit", "LargeTickMiss",
   "SmallTickHit", "SmallTickMiss",
]);

export const COMBO_EXPONENT = 0.5;

// Accuracy-max contribution per judgement = base of its MaxResult (perfect-play value),
// not the emitted (miss→0) value. Critical for IgnoreMiss (tail miss → max from SliderTailHit=150).
export const RESULT_MAX = {
   Great: 300, Ok: 300, Meh: 300, Miss: 300,
   SliderTailHit: 150, IgnoreMiss: 150,
   LargeTickHit: 30, LargeTickMiss: 30,
   SmallTickHit: 10, SmallTickMiss: 10,
   LargeBonus: 0, SmallBonus: 0, IgnoreHit: 0,
};

export function baseScoreFor(type) {
   return RESULT_BASE[type] ?? 0;
}
export function maxScoreFor(type) {
   return RESULT_MAX[type] ?? 0;
}

// Lazer ScoreProcessor.ComputeTotalScore (ppy/osu master):
//   500000·acc·comboProgress + 500000·acc^5·accProgress + bonusPortion
export function computeTotalScore(acc, comboProgress, accProgress, bonusPortion) {
   return (
      500000 * acc * comboProgress +
      500000 * Math.pow(acc, 5) * accProgress +
      bonusPortion
   );
}

// Lazer combo score change per judgement: base(MaxResult) * comboAfter^0.5
export function comboScoreChange(maxResultBase, comboAfter) {
   return maxResultBase * Math.pow(comboAfter, COMBO_EXPONENT);
}

// Minimal in-memory replica of the typed scoring loop for tests.
export function makeScorer(scoreMultiplier = 1) {
   const s = {
      combo: 0, maxcombo: 0,
      judgeTotal: 0, maxJudgeTotal: 0,
      bonusPortion: 0, comboPortion: 0, maximumComboPortion: 0,
      accuracyJudgementCount: 0, maximumAccuracyJudgementCount: 0,
      score: 0, fullcombo: true,
   };
   s.scoreTyped = function (type, value, opts = {}) {
      const base = baseScoreFor(type);
      const hitNow = !!opts.hit;
      if (opts.displayOnly) return s;
      const isBonus = type === "LargeBonus" || type === "SmallBonus";
      const affectsAcc = RESULT_ACCURACY.has(type);
      if (isBonus) s.bonusPortion += value;
      else if (affectsAcc) { s.judgeTotal += value; s.maxJudgeTotal += maxScoreFor(type); }
      if (!isBonus && type !== "IgnoreMiss" && type !== "IgnoreHit") {
         if (hitNow) { s.combo += 1; s.comboPortion += base * Math.pow(s.combo, COMBO_EXPONENT); }
         else { s.combo = 0; s.fullcombo = false; }
      }
      s.maxcombo = Math.max(s.maxcombo, s.combo);
      s.accuracyJudgementCount += affectsAcc ? 1 : 0;
      s.maximumComboPortion += isBonus ? 0 : base * Math.pow(s.combo > 0 ? s.combo : s.maxcombo || 1, COMBO_EXPONENT);
      s.maximumAccuracyJudgementCount += affectsAcc ? 1 : 0;
      const acc = s.maxJudgeTotal ? s.judgeTotal / s.maxJudgeTotal : 1;
      const cp = s.maximumComboPortion > 0 ? s.comboPortion / s.maximumComboPortion : 1;
      const ap = s.maximumAccuracyJudgementCount > 0 ? s.accuracyJudgementCount / s.maximumAccuracyJudgementCount : 1;
      s.score = Math.round(computeTotalScore(acc, cp, ap, s.bonusPortion) * scoreMultiplier);
      return s;
   };
   return s;
}
