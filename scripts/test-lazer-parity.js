// Property tests for lazer-parity-mega Track A judging:
//   - lazerHitWindows(OD) matches lazer's OsuHitWindows for OD 0..10
//   - lazerDifficultyRange matches lazer's IBeatmapDifficultyInfo.DifficultyRange
//   - SliderJudge.finalScore() matches the per-part threshold table from spec
//
// Run: node scripts/test-lazer-parity.js
// Exit 0 on pass, 1 on failure. Pure-Node (no browser needed).

import { strict as assert } from "node:assert";
import {
   lazerHitWindows,
   lazerDifficultyRange,
   LAZER_MISS_WINDOW,
} from "../src/game/lazerHpTables.js";
import SliderJudge from "../src/game/slider-judge.js";
import SliderScorer, { TAIL_LENIENCY } from "../src/game/slider-scorer.js";
import {
   RESULT_BASE, baseScoreFor, computeTotalScore, comboScoreChange, makeScorer, COMBO_EXPONENT,
} from "../src/game/score-math.js";

let passed = 0;
let failed = 0;
function check(name, fn) {
   try {
      fn();
      console.log(`  ok  ${name}`);
      passed++;
   } catch (e) {
      console.log(`FAIL  ${name}`);
      console.log(`      ${e.message}`);
      failed++;
   }
}

console.log("== lazerDifficultyRange ==");
for (const od of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
   check(`difficultyRange(od=${od}, min=80, mid=50, max=20)`, () => {
      const got = lazerDifficultyRange(od, 80, 50, 20);
      // lazer: 0..5 -> mid + (mid-min) * (od-5)/5 ; 5..10 -> mid + (max-mid) * (od-5)/5
      // at od=5 strictly mid=50; od=0 -> 80; od=10 -> 20
      const expected =
         od > 5
            ? 50 + (20 - 50) * ((od - 5) / 5)
            : od < 5
              ? 50 + (50 - 80) * ((od - 5) / 5)
              : 50;
      assert.equal(got, expected, `expected ${expected}, got ${got}`);
   });
}

console.log("== lazerHitWindows ==");
for (let od = 0; od <= 10; od++) {
   check(`hitWindows(od=${od}).great === floor(range) - 0.5`, () => {
      const w = lazerHitWindows(od);
      const expectedGreat =
         Math.floor(lazerDifficultyRange(od, 80, 50, 20)) - 0.5;
      assert.equal(w.great, expectedGreat);
   });
   check(`hitWindows(od=${od}).ok === floor(range) - 0.5`, () => {
      const w = lazerHitWindows(od);
      const expectedOk =
         Math.floor(lazerDifficultyRange(od, 140, 100, 60)) - 0.5;
      assert.equal(w.ok, expectedOk);
   });
   check(`hitWindows(od=${od}).meh === floor(range) - 0.5`, () => {
      const w = lazerHitWindows(od);
      const expectedMeh =
         Math.floor(lazerDifficultyRange(od, 200, 150, 100)) - 0.5;
      assert.equal(w.meh, expectedMeh);
   });
   check(`hitWindows(od=${od}).miss === LAZER_MISS_WINDOW (400)`, () => {
      const w = lazerHitWindows(od);
      assert.equal(w.miss, LAZER_MISS_WINDOW);
      assert.equal(w.miss, 400);
   });
}

// Spot-check known values (lazer reference points)
check("od=5: great=49.5, ok=99.5, meh=149.5", () => {
   const w = lazerHitWindows(5);
   assert.equal(w.great, 49.5);
   assert.equal(w.ok, 99.5);
   assert.equal(w.meh, 149.5);
});
check("od=10: great=19.5, ok=59.5, meh=99.5", () => {
   const w = lazerHitWindows(10);
   assert.equal(w.great, 19.5);
   assert.equal(w.ok, 59.5);
   assert.equal(w.meh, 99.5);
});
check("od=0: great=79.5, ok=139.5, meh=199.5", () => {
   const w = lazerHitWindows(0);
   assert.equal(w.great, 79.5);
   assert.equal(w.ok, 139.5);
   assert.equal(w.meh, 199.5);
});

console.log("== SliderJudge.finalScore ==");
function makeFakeHit({ ticks = 3, repeat = 2 } = {}) {
   // Hit has `ticks` (array), `repeat` (count of edges incl. head).
   return {
      ticks: Array.from({ length: ticks }, (_, i) => ({ time: i * 100 })),
      repeat,
   };
}

check("all parts hit, tail hit → 300", () => {
   const j = new SliderJudge(makeFakeHit());
   for (let i = 0; i < 3; i++) j.recordTick(null, i);
   j.recordEdge(null, 0); // edges: repeat=2 means 2 edges total (one head one tail? treat as 2)
   j.recordEdge(null, 1);
   j.recordTailHit(0);
   assert.equal(j.finalScore(), 300);
});

check("all parts hit, tail missed → 100", () => {
   const j = new SliderJudge(makeFakeHit());
   for (let i = 0; i < 3; i++) j.recordTick(null, i);
   j.recordEdge(null, 0);
   j.recordEdge(null, 1);
   // no recordTailHit
   assert.equal(j.finalScore(), 100);
});

check("~half parts hit → 100 (>= 0.5 ratio)", () => {
   const j = new SliderJudge(makeFakeHit({ ticks: 3, repeat: 2 }));
   j.recordTick(null, 0);
   j.recordTick(null, 1);
   j.recordTickMiss(2);
   j.recordEdge(null, 0);
   j.recordEdgeMiss(1);
   // ratio = 3/5 = 0.6 → 100
   assert.equal(j.finalScore(), 100);
});

check("few parts hit → 50", () => {
   const j = new SliderJudge(makeFakeHit({ ticks: 3, repeat: 2 }));
   j.recordTick(null, 0);
   j.recordTickMiss(1);
   j.recordTickMiss(2);
   j.recordEdgeMiss(0);
   j.recordEdgeMiss(1);
   // ratio = 1/5 = 0.2 → 50
   assert.equal(j.finalScore(), 50);
});

check("nothing hit → 0 (miss)", () => {
   const j = new SliderJudge(makeFakeHit());
   j.recordTickMiss(0);
   j.recordTickMiss(1);
   j.recordTickMiss(2);
   j.recordEdgeMiss(0);
   j.recordEdgeMiss(1);
   assert.equal(j.finalScore(), 0);
});

check("slider with no ticks: tail decides", () => {
   const j = new SliderJudge({ ticks: [], repeat: 1 });
   // totalPossible = 1 edge; hit the edge AND the tail → 300
   j.recordEdge(null, 0);
   j.recordTailHit(0);
   assert.equal(j.finalScore(), 300);
});

check("finalResultType mapping", () => {
   // Just verify the string mapping; the score logic is tested above.
   const j300 = new SliderJudge({ ticks: [], repeat: 1 });
   j300.recordEdge(null, 0);
   j300.recordTailHit(0);
   assert.equal(j300.finalResultType(), "Great");
   const jMiss = new SliderJudge(makeFakeHit());
   jMiss.recordTickMiss(0);
   jMiss.recordTickMiss(1);
   jMiss.recordTickMiss(2);
   jMiss.recordEdgeMiss(0);
   jMiss.recordEdgeMiss(1);
   assert.equal(jMiss.finalResultType(), "Miss");
});

console.log("== Score V2 (real lazer ComputeTotalScore) ==");
check("combo exponent is 0.5", () => {
   assert.equal(COMBO_EXPONENT, 0.5);
   assert.equal(comboScoreChange(300, 100), 300 * Math.pow(100, 0.5)); // 3000
});
check("base-score table (lazer GetBaseScoreForResult)", () => {
   assert.equal(baseScoreFor("Great"), 300);
   assert.equal(baseScoreFor("Ok"), 100);
   assert.equal(baseScoreFor("Meh"), 50);
   assert.equal(baseScoreFor("Miss"), 0);
   assert.equal(baseScoreFor("LargeTickHit"), 30);
   assert.equal(baseScoreFor("SliderTailHit"), 150);
   assert.equal(baseScoreFor("LargeBonus"), 50);
   assert.equal(baseScoreFor("SmallBonus"), 10);
});
check("perfect play = 1,000,000", () => {
   assert.equal(computeTotalScore(1, 1, 1, 0), 1000000);
});
check("accuracy^5 in second term", () => {
   // acc=0.9: term2 = 500000 * 0.9^5 * 1 = 500000*0.59049 = 295245
   const s = computeTotalScore(0.9, 1, 1, 0);
   assert.ok(Math.abs(s - (500000 * 0.9 + 500000 * Math.pow(0.9, 5))) < 0.001, "term2 uses acc^5");
});
check("bonus adds flat", () => {
   const s = computeTotalScore(1, 1, 1, 500);
   assert.equal(s, 1000500);
});

console.log("== typed pipe combo rules ==");
check("tail miss (IgnoreMiss) does NOT break combo", () => {
   const sc = makeScorer();
   sc.scoreTyped("Great", 300, { hit: true });
   sc.scoreTyped("Great", 300, { hit: true });
   assert.equal(sc.combo, 2);
   sc.scoreTyped("IgnoreMiss", 0, { hit: false }); // tail miss
   assert.equal(sc.combo, 2, "combo preserved on IgnoreMiss");
   assert.equal(sc.fullcombo, true, "IgnoreMiss not a fullcombo break in this mirror");
});
check("LargeTickMiss (tick miss) breaks combo", () => {
   const sc = makeScorer();
   sc.scoreTyped("Great", 300, { hit: true });
   sc.scoreTyped("Great", 300, { hit: true });
   sc.scoreTyped("LargeTickMiss", 0, { hit: false });
   assert.equal(sc.combo, 0);
});
check("tail hit counts 150/150 in accuracy", () => {
   const sc = makeScorer();
   sc.scoreTyped("SliderTailHit", 150, { hit: true });
   assert.equal(sc.judgeTotal, 150);
   assert.equal(sc.maxJudgeTotal, 150);
});
check("bonus does not touch combo or accuracy", () => {
   const sc = makeScorer();
   sc.scoreTyped("Great", 300, { hit: true });
   const accBefore = sc.judgeTotal / sc.maxJudgeTotal;
   sc.scoreTyped("LargeBonus", 50, { hit: true });
   assert.equal(sc.combo, 1, "combo unchanged by bonus");
   assert.equal(sc.judgeTotal, 300, "accuracy unchanged by bonus");
   assert.equal(sc.bonusPortion, 50);
});
check("slider own judgement (displayOnly) contributes nothing", () => {
   const sc = makeScorer();
   sc.scoreTyped("Great", 150, { hit: true, displayOnly: true });
   assert.equal(sc.judgeTotal, 0);
   assert.equal(sc.combo, 0);
   assert.equal(sc.score, 0, Math.round(computeTotalScore(1,1,1,0)*1) === 1000000 ? "score still baseline" : "");
});

console.log("== typed pipe score shape (sanity) ==");
check("a realistic slider play yields a plausible increasing score", () => {
   const sc = makeScorer();
   sc.scoreTyped("Great", 300, { hit: true });          // head
   sc.scoreTyped("LargeTickHit", 30, { hit: true });     // tick
   sc.scoreTyped("LargeTickHit", 30, { hit: true });     // repeat
   sc.scoreTyped("SliderTailHit", 150, { hit: true });   // tail
   assert.ok(sc.score > 0, "score positive");
   assert.ok(sc.fullcombo, "no break in this play");
   assert.ok(Math.abs((sc.judgeTotal / sc.maxJudgeTotal) - 1) < 1e-9, "all-hit play is 100% acc");
});

console.log("== SliderScorer (lazer nested-part transitions) ==");
function sliderHit({ ticks = 2, repeat = 2 } = {}) {
   return {
      type: "slider", time: 0, sliderTime: 100, endTime: repeat * 100, repeat,
      ticks: Array.from({ length: ticks }, (_, i) => ({ time: (i + 1) * 25 })),
      judgements: [],
   };
}
function sink() {
   const calls = [];
   return {
      calls,
      score: (type, value, time, opts) => calls.push({ kind: "score", type, value, time, opts }),
      display: (judgeIndex, score, time) => calls.push({ kind: "display", judgeIndex, score, time }),
      tickSound: () => {}, sound: () => {},
   };
}

check("full track: ticks+repeats LargeTickHit, tail SliderTailHit, display 300 displayOnly", () => {
   const s = sink();
   const h = sliderHit({ ticks: 2, repeat: 2 });
   const sc = new SliderScorer(h, { ...s, hitIndex: 7 });
   sc.recordHead(true);
   sc.update(25, true);   // tick1
   sc.update(50, true);   // tick2
   sc.update(100, true);  // repeat1
   sc.update(200, true);  // repeat2 = endTime -> tail too
   const scores = s.calls.filter((c) => c.kind === "score");
   const tickHits = scores.filter((c) => c.type === "LargeTickHit").length;
   assert.ok(tickHits >= 3, `expected >=3 LargeTickHit (2 tick + 1+ repeats), got ${tickHits}`);
   assert.ok(scores.some((c) => c.type === "SliderTailHit" && c.value === 150), "tail -> SliderTailHit 150");
   const disp = s.calls.find((c) => c.kind === "display");
   assert.ok(disp && disp.score === 300, "display = 300 (any hit)");
   assert.ok(scores.some((c) => c.opts && c.opts.displayOnly), "slider popup is displayOnly");
});

check("no tracking: all parts miss, tail=IgnoreMiss (no SliderTailHit), display MISS(0)", () => {
   const s = sink();
   const h = sliderHit({ ticks: 2, repeat: 2 });
   const sc = new SliderScorer(h, { ...s, hitIndex: 7 });
   sc.recordHead(false); // head missed too
   sc.update(25, false); sc.update(50, false); sc.update(100, false); sc.update(200, false);
   const scores = s.calls.filter((c) => c.kind === "score");
   assert.ok(scores.filter((c) => c.type === "LargeTickMiss").length >= 3, "ticks+repeats -> LargeTickMiss");
   assert.ok(scores.some((c) => c.type === "IgnoreMiss"), "tail -> IgnoreMiss");
   assert.ok(!scores.some((c) => c.type === "SliderTailHit"), "no SliderTailHit on miss");
   const disp = s.calls.find((c) => c.kind === "display");
   assert.ok(disp && disp.score === 0, "display = 0 (nothing hit)");
});

check("tail IgnoreMiss does NOT break combo (fed to typed pipe)", () => {
   const sc = makeScorer();
   sc.scoreTyped("Great", 300, { hit: true });
   sc.scoreTyped("Great", 300, { hit: true });
   sc.scoreTyped("IgnoreMiss", 0, { hit: false }); // tail miss
   assert.equal(sc.combo, 2, "combo preserved after tail IgnoreMiss");
   assert.equal(sc.maxJudgeTotal, 300 + 300 + 150, "accuracy max includes tail 150 (0 scored)");
});

check("tick miss breaks combo (LargeTickMiss is combo-relevant)", () => {
   const sc = makeScorer();
   sc.scoreTyped("Great", 300, { hit: true });
   sc.scoreTyped("LargeTickMiss", 0, { hit: false });
   assert.equal(sc.combo, 0);
});

// Lazer rule (SliderInputManager): Tracking requires the head to be hit first.
// A dropped head means no part can track, so nothing hits → display Miss.
check("head miss → parts can't track → display MISS even if cursor in follow", () => {
   const s = sink();
   const h = sliderHit({ ticks: 1, repeat: 1 });
   const sc = new SliderScorer(h, { ...s, hitIndex: 0 });
   sc.recordHead(false); // head missed
   sc.update(25, true);  // cursor in follow, but head dropped → not tracking
   sc.update(100, true);
   const disp = s.calls.find((c) => c.kind === "display");
   assert.ok(disp && disp.score === 0, "dropped head → no nested hit → display Miss");
});

check("TAIL_LENIENCY is a fixed grace (not OD window)", () => {
   assert.equal(TAIL_LENIENCY, 36);
});

check("lazer rule: dropped head → parts cannot track even if cursor in follow", () => {
   const s = sink();
   const h = sliderHit({ ticks: 1, repeat: 1 });
   const sc = new SliderScorer(h, { ...s, hitIndex: 0 });
   sc.recordHead(false); // head missed
   sc.update(25, true);  // cursor would be in follow, but head was dropped
   sc.update(100, true);
   const scores = s.calls.filter((c) => c.kind === "score");
   assert.ok(!scores.some((c) => c.type === "LargeTickHit"), "no LargeTickHit after dropped head");
   assert.ok(scores.some((c) => c.type === "IgnoreMiss"), "tail still judged IgnoreMiss (no HP)");
});

console.log("== Spinner bonus (lazer) ==");
import { lazerSpinnerRpm } from "../src/game/lazerHpTables.js";
function spinnerState(od, durationMs) {
   const rpm = lazerSpinnerRpm(od);
   const rotationRequired = (2 * Math.PI * (rpm.clear / 60) * durationMs) / 1000;
   const spinsRequired = rotationRequired / (2 * Math.PI);
   const spinsRequiredForBonus = spinsRequired + 2;
   const completeSpins = Math.round((rpm.complete / 60) * (durationMs / 1000));
   const maximumBonusSpins = Math.max(0, completeSpins - spinsRequired - 2);
   return { rotationRequired, spinsRequired, spinsRequiredForBonus, completeSpins, maximumBonusSpins };
}

check("spinner bonus begins only after required+2 full spins", () => {
   const s = spinnerState(5, 2000); // 2s spinner, OD 5
   // spinsRequired = (150/60)*2 = 5 ; bonus from 7
   assert.ok(Math.abs(s.spinsRequired - 5) < 1e-6);
   assert.equal(s.spinsRequiredForBonus, 7);
});
check("maximumBonusSpins capped by complete RPM", () => {
   const s = spinnerState(5, 2000);
   // completeSpins = round((380/60)*2)=round(12.666)=13 ; 13-5-2=6
   assert.equal(s.maximumBonusSpins, 6);
});
check("bonus grant count never exceeds maximumBonusSpins", () => {
   const s = spinnerState(5, 2000);
   let granted = 0;
   // simulate up to 30 full spins (way past cap) — must clamp at maximumBonusSpins
   for (let spins = 1; spins <= 30; spins++) {
      const bonusCount = Math.min(Math.max(0, spins - s.spinsRequiredForBonus), s.maximumBonusSpins);
      while (granted < bonusCount) granted++;
   }
   assert.equal(granted, 6, `30 spins → capped at ${s.maximumBonusSpins} bonus`);
});
check("no bonus until required+2 spins", () => {
   const s = spinnerState(5, 2000);
   let granted = 0;
   for (let spins = 1; spins <= s.spinsRequiredForBonus; spins++) {
      const bonusCount = Math.min(spins - s.spinsRequiredForBonus, s.maximumBonusSpins);
      while (granted < bonusCount && bonusCount >= 0) granted++;
   }
   assert.equal(granted, 0, "no bonus at or below required+2");
});



console.log("");
console.log(`passed: ${passed}`);
console.log(`failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
