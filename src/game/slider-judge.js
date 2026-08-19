// SliderJudge — accumulates tick/edge/follow results for a slider and computes
// the final lazer judgement at slider end. Per M1.9, this class owns the
// *decision* state only: it tracks what was hit/missed per part. The score
// *event emission* (typed-pipe, score overlay updates) is owned by
// slider-scorer.js. The two classes cooperate via playback.js#createSlider:
// playback reads SliderJudge state every frame to drive the slider body
// (head-gates-tracking, current edge, current tick), and playback reads
// SliderScorer state to drive the score pipeline.
//
// Lazer slider scoring (OsuSliderJudgement + OsuHealthProcessor):
//   - Each tick (SmallTick/LargeTick) scores immediately: tick hit = +10 score,
//     tick miss = 0. HP changes per lazerHpIncrease(SmallTickHit/LargeTickMiss).
//   - Each edge (SliderRepeat) scores immediately: edge hit = +30 score,
//     HP +0.02 (LargeTickHit for SliderRepeat).
//   - The slider head (SliderHeadCircle) is judged like a normal circle (Great/Ok/Meh/Miss)
//     at the slider start — this already happens via hitSuccess in the current code.
//   - The slider tail (SliderTailCircle) gets a SliderTailHit (or Miss) at the end.
//   - The FINAL slider judgement (Great/Ok/Meh/Miss) is computed from the accumulator:
//     all ticks + all edges + tail hit → Great (300)
//     most ticks + most edges → Ok (100)
//     some ticks → Meh (50)
//     none → Miss (0)
//
// This class tracks the accumulator; the playback.js slider update calls
// recordTick/recordEdge/recordTail each frame, then finalScore() at slider end.

export class SliderJudge {
  constructor(hit) {
    this.hit = hit;
    this.totalTicks = hit.ticks ? hit.ticks.length : 0;
    this.totalEdges = hit.repeat || 1;  // number of edges (repeats)
    this.ticksHit = 0;
    this.ticksMissed = 0;
    this.edgesHit = 0;
    this.edgesMissed = 0;
    this.tailHit = false;
    this.followTime = 0;  // ms of follow-circle held (for bonus)
    this._finalScore = -1;  // -1 = not yet judged
  }

  recordTick(hit, time) {
    this.ticksHit++;
  }

  recordTickMiss(time) {
    this.ticksMissed++;
  }

  recordEdge(hit, time) {
    this.edgesHit++;
  }

  recordEdgeMiss(time) {
    this.edgesMissed++;
  }

  recordTailHit(time) {
    this.tailHit = true;
  }

  recordFollowTime(dtMs) {
    this.followTime += dtMs;
  }

  // Compute the final slider judgement from the accumulator.
  // Lazer thresholds (approximate from OsuSliderJudgement):
  //   - Great (300): all ticks hit, all edges hit, tail hit
  //   - Ok (100): most ticks hit, most edges hit
  //   - Meh (50): some ticks hit
  //   - Miss (0): nothing hit
  finalScore() {
    if (this._finalScore >= 0) return this._finalScore;
    const totalPossible = this.totalTicks + this.totalEdges;
    const totalHit = this.ticksHit + this.edgesHit;
    if (totalPossible === 0) {
      // no ticks/edges — judge on tail only
      this._finalScore = this.tailHit ? 300 : 0;
      return this._finalScore;
    }
    const ratio = totalHit / totalPossible;
    if (ratio >= 1.0 && this.tailHit) this._finalScore = 300;
    else if (ratio >= 0.5) this._finalScore = 100;
    else if (ratio > 0) this._finalScore = 50;
    else this._finalScore = 0;
    return this._finalScore;
  }

  // The lazer hit result type string for the final judgement (for HP drain).
  finalResultType() {
    const s = this.finalScore();
    if (s === 300) return "Great";
    if (s === 100) return "Ok";
    if (s === 50) return "Meh";
    return "Miss";
  }
}

export default SliderJudge;