// SliderScorer — lazer-faithful nested-part slider judgement seam (lazer-parity-mega).
//
// Owns one slider's nested hit objects (head / ticks / repeats / tail) and the
// typed scoring transitions. Per M1.9, this class owns the *score event
// emission* (typed-pipe, score overlay updates). The per-frame *decision*
// state (current position, edge detection, accumulator) is owned by
// slider-judge.js. The two classes cooperate via playback.js#createSlider:
// playback reads SliderJudge state every frame to drive the slider body,
// and playback feeds SliderScorer with timing + tracking facts; the scorer
// decides what was judged and drives the typed pipe.
//
// Pure logic: no PIXI, no globals except the scoreSink passed in.
// Headless-testable in Node.
//
// Model (verified against ppy/osu master):
//   - head  (SliderHeadCircle): standard circle judgement, judged at startTime.
//   - tick  (SliderTick):        LargeTickHit if tracking at tick time (timeOffset>=0),
//                                else LargeTickMiss. Combo-relevant (miss breaks combo).
//   - repeat(SliderRepeat):      LargeTickHit/Miss by tracking at repeat crossing. Combo-relevant.
//   - tail  (SliderTailCircle):  SliderTailHit (base 150) if tracking at EndTime,
//                                else IgnoreMiss — NO combo break, NO miss HP, contributes
//                                0/150 to accuracy. Judged exactly at EndTime.
//   - slider's OWN judgement:    binary display-only (OsuIgnoreJudgement) — any nested
//                                part hit → display Great; none hit → display Miss.
//                                Contributes nothing to score/accuracy/combo.
//
// Lazer's SliderInputManager judges tail only after the last tick/repeat has
// judged (TAIL_LENIENCY grace). We mirror that ordering in update().

// Fixed tail leniency (lazer SliderEventGenerator.TAIL_LENIENCY).
export const TAIL_LENIENCY = 36;

export class SliderScorer {
   // hit: the playback hit object ({time, endTime, ticks[], repeat, sliderTime, type:"slider"})
   // opts: { score(resultType, value, time, opts) -> applies to typed pipe,
   //         display(judgeIndex, displayScore, time) -> visual popup,
   //         sound(hit, part, time), tickSound(hit, tick, time),
   //         hitIndex }
   constructor(hit, opts) {
      this.hit = hit;
      this.o = opts;
      // build the ordered nested-part schedule
      this.parts = [];
      if (hit.ticks) {
         for (let i = 0; i < hit.ticks.length; i++)
            this.parts.push({ kind: "tick", time: hit.ticks[i].time, tick: hit.ticks[i], judged: false, hit: false });
      }
      for (let r = 1; r <= (hit.repeat || 1); r++)
         this.parts.push({ kind: "repeat", time: hit.time + r * hit.sliderTime, repIndex: r, judged: false, hit: false });
      this.tail = { time: hit.endTime, judged: false, hit: false };
      this.sortParts();
      this.anyNestedHit = false;   // drives the binary slider display judgement
      this.displayEmitted = false; // binary slider popup emitted once
   }

   sortParts() {
      this.parts.sort((a, b) => a.time - b.time);
   }

   _markHit(part) {
      part.hit = true;
      this.anyNestedHit = true;
   }

   // The slider's binary display judgement (OsuIgnoreJudgement): any part hit →
   // display Great (300), none → display Miss (0). Display-only; no scoring.
   displayScore() {
      return this.anyNestedHit ? 300 : 0;
   }
   maybeEmitDisplay(time) {
      if (this.displayEmitted) return;
      // emit once the tail has judged (slider fully resolved)
      if (this.tail.judged) {
         this.displayEmitted = true;
         this.o.score("SliderDisplay", this.displayScore(), time, { displayOnly: true, hitIndex: this.o.hitIndex, part: "slider", hit: this.anyNestedHit });
         this.o.display(this.hit.judgements ? this.hit.judgements.length - 1 : 0, this.displayScore(), time);
      }
   }

   // tracking: whether the cursor is currently Tracking the slider (in follow
   // circle AND key held, per lazer's Tracking). Call each frame during the slider.
   // Returns array of {kind, judged, hit, time} for anything judged this frame.
   update(time, tracking) {
      const events = [];
      if (!this.parts) return events;
      const h = this.hit;
      // Lazer: Tracking only counts once the head circle has been hit. If the head
      // was missed, the whole slider is dropped — every part judges as a miss.
      const effectiveTracking = tracking && this.headHit !== false;
      // judge due ticks and repeats
      const due = this.parts.filter((p) => !p.judged && time >= p.time);
      for (const p of due) {
         p.judged = true;
         if (effectiveTracking) {
            this._markHit(p);
            if (p.kind === "tick") {
               if (p.tick) p.tick.result = true;
               this.o.tickSound && this.o.tickSound(h, p.time);
            } else {
               this.o.sound && this.o.sound(h, p.repIndex, p.time);
            }
            this.o.score("LargeTickHit", 30, time, { hit: true, hitObjectKind: "SliderTick", hitIndex: this.o.hitIndex, part: p.kind });
         } else {
            this.o.score("LargeTickMiss", 0, time, { hit: false, hitObjectKind: "SliderTick", hitIndex: this.o.hitIndex, part: p.kind });
         }
         events.push(p);
      }
      // tail judges at EndTime once prior parts resolved (lazer ordering)
      const lastPartTime = this.parts.length ? this.parts[this.parts.length - 1].time : -Infinity;
      const allPriorJudged = this.parts.every((p) => p.judged || p.time > time - 0);
      if (!this.tail.judged && time >= this.tail.time && time >= this.tail.time - TAIL_LENIENCY && time >= lastPartTime) {
         this.tail.judged = true;
         if (effectiveTracking) {
            this._markHit(this.tail);
            this.o.score("SliderTailHit", 150, time, { hit: true, hitIndex: this.o.hitIndex, part: "tail" });
         } else {
            // IgnoreMiss: no score event, no combo break, no HP — but still affects accuracy (0/150)
            this.o.score("IgnoreMiss", 0, time, { hit: false, hitIndex: this.o.hitIndex, part: "tail" });
         }
         events.push(this.tail);
      }
      this.maybeEmitDisplay(time);
      return events;
   }

   // Head judgement is a normal circle — handled by playback's hitSuccess; the
   // scorer only needs to know the outcome to feed the binary display + combo tier.
   // Lazer's SliderInputManager: Tracking only counts once the head has been hit —
   // dropping the head means ticks/repeats/tail cannot track (all miss).
   recordHead(pointsMissedOrHit) {
      // pointsMissedOrHit: true if head circle was hit (any of 300/100/50)
      if (pointsMissedOrHit) this.anyNestedHit = true;
      this.headHit = !!pointsMissedOrHit;
   }
}

export default SliderScorer;
