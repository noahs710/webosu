
import { lazerHpIncrease, lazerDifficultyRange, LAZER_LAST_COMBO_BONUS } from "../lazerHpTables.js";
import { jlog } from "../logger.js";
import {
   computeTotalScore,
   comboScoreChange,
   baseScoreFor,
   maxScoreFor,
   RESULT_ACCURACY,
   COMBO_EXPONENT,
} from "../score-math.js";

   function addPlayHistory(summary) {
      if (!window.playHistory1000) {
         window.playHistory1000 = [];
      }
      window.playHistory1000.push(summary);
      if (window.playHistory1000.length > 1000) window.playHistory1000.shift();
      // save history — localforage is the primary path; fall back to localStorage
      // so the in-memory list still survives a refresh when localforage failed
      // to load (e.g. private-mode Safari, IndexedDB quota exhausted).
      let persisted = false;
      if (window.localforage) {
         try {
            localforage.setItem(
               "playhistory1000",
               window.playHistory1000,
               function (err) {
                  if (err) { console.error("Error saving play history"); }
               }
            );
            persisted = true;
         } catch (e) { /* swallow — fall through to localStorage */ }
      }
      if (!persisted) {
         try { window.localStorage.setItem("playhistory1000", JSON.stringify(window.playHistory1000)); } catch (e) {}
      }
   }

   // Lazer grade: SS/S/A/B/C/D, with silver SSH/SH for FC + (HD or FL).
   // The fullcombo flag and mod info (HD/FL active) determine the silver distinction.
   function grade(acc, fullcombo, hasHdOrFl) {
      let g;
      if (acc >= 1) g = "SS";
      else if (acc >= 0.95) g = "S";
      else if (acc >= 0.9) g = "A";
      else if (acc >= 0.8) g = "B";
      else if (acc >= 0.7) g = "C";
      else g = "D";
      // Silver SS/S (SSH/SH): lazer awards for FC with Hidden or Flashlight active
      if (fullcombo && hasHdOrFl) {
         if (g === "SS") g = "SSH";
         else if (g === "S") g = "SH";
      }
      return g;
   }

   function getUser(name) {
      let cookie = {};
      document.cookie.split(";").forEach(function (el) {
         let [key, value] = el.split("=");
         cookie[key.trim()] = value;
      });
      return cookie[name];
   }

   function LazyNumber(value = 0) {
      this.value = value;
      this.target = value;
      this.lasttime = -1000000; // playback can start before time=0
   }
   LazyNumber.prototype.lag = 200;
   // param time must be non-decreasing
   LazyNumber.prototype.update = function (time) {
      this.value +=
         (this.target - this.value) *
         (1 - Math.exp((this.lasttime - time) / this.lag));
      this.lasttime = time;
   };
   // param time must be non-decreasing
   LazyNumber.prototype.set = function (time, value) {
      this.update(time);
      this.target = value;
   };
   // param time must be non-decreasing
   LazyNumber.prototype.valueAt = function (time) {
      this.update(time);
      return this.value;
   };

   class ScoreOverlay extends PIXI.Container {
  constructor(windowfield, HPdrain, scoreMultiplier, mods) {
    super();

      // constructor.

      this.field = windowfield;
      this.HPdrain = HPdrain;
      this.scaleMul = windowfield.height / 800;
      this.scoreMultiplier = scoreMultiplier;
      this.nofail = !!(mods && mods.nofail);
      this.suddendeath = !!(mods && mods.suddendeath);
      this.perfect = !!(mods && mods.perfect);
      this.classic = !!(mods && mods.classic);
      this.failed = false;
      // lazer-style standardised score (V2) base + passive HP drain
      this.v1Score = 0;
      this.lastDrainTime = -1e9;
      // Lazer drain rate: lazer computes this per-beatmap via a binary search that
      // targets a minimum health (99% at HP=0, 90% at HP=5, 40% at HP=10) for a
      // perfect play (DrainingHealthProcessor.ComputeDrainRate). That requires
      // simulating the whole beatmap's HP increases — too complex for inline.
      // This approximation scales with HPdrain; the per-judgement HP values
      // (lazerHpIncrease) are the impactful change and are exact.
      this.passiveDrain = lazerDifficultyRange(HPdrain || 0, 0.0000015, 0.000004, 0.0000075);

      this.score = 0; // this have been multiplied by scoreMultiplier
      this.combo = 0;
      this.maxcombo = 0;
      this.judgeTotal = 0;
      this.maxJudgeTotal = 0;
      this.HP = 1;
      this.fullcombo = true;
      // accuracy = judgeTotal / maxJudgeTotal

      // ── Lazer Score V2 typed-pipe state (D1 — audit finding) ──────────────
      // When FEATURES.lazerScoreV2 is on, every judgement routes through
      // scoreTyped() which accumulates: comboPortion (Σ base·comboAfter^0.5),
      // maximumComboPortion (perfect-play ceiling), bonusPortion (Large/SmallBonus),
      // accuracyJudgementCount / maximumAccuracyJudgementCount. The production
      // score is then computeTotalScore(acc, cp, ap, bp) × scoreMultiplier —
      // matching ppy/osu ScoreProcessor.ComputeTotalScore exactly. The pure-math
      // mirror lives in score-math.js (used by the property tests).
      this.comboPortion = 0;
      this.maximumComboPortion = 0;
      this.bonusPortion = 0;
      this.accuracyJudgementCount = 0;
      this.maximumAccuracyJudgementCount = 0;
      // Per-combo tier tracking for the last-in-combo HP bonus (D3).
      // _comboHadMeh/Miss/Ok/tailMiss track the current (in-progress) combo's
      // results so the tier can be computed when the combo's last hit lands.
      this._comboHadMeh = false;
      this._comboHadMiss = false;
      this._comboHadOk = false;
      this._comboHadTailMiss = false;

      this.onfail = null;
      this.judgecnt = {
         great: 0,
         good: 0,
         meh: 0,
         miss: 0,
      };

      this.score4display = new LazyNumber(this.score);
      this.combo4display = new LazyNumber(this.combo);
      this.accuracy4display = new LazyNumber(1);
      this.HP4display = new LazyNumber(this.HP);

      this.newSpriteArray = function (len, scaleMul = 1, tint = 0xffffff) {
         let a = new Array(len);
         for (let i = 0; i < len; ++i) {
            a[i] = new PIXI.Sprite();
            a[i].scale.x = a[i].scale.y = this.scaleMul * scaleMul;
            a[i].anchor.x = 0;
            a[i].anchor.y = 0;
            a[i].alpha = 1;
            a[i].tint = tint;
            this.addChild(a[i]);
         }
         return a;
      };

      this.scoreDigits = this.newSpriteArray(10, 0.4, 0xddffff); // 9999999999
      this.comboDigits = this.newSpriteArray(6, 0.2, 0xddffff); // 99999x
      this.accuracyDigits = this.newSpriteArray(7, 0.2, 0xddffff); // 100.00%

      this.HPbar = this.newSpriteArray(3, 0.5);
      // HP marker (scorebar-ki) — sits at the right edge of the HP fill
      this.HPmarker = new PIXI.Sprite();
      this.HPmarker.anchor.set(0.5);
      this.HPmarker.scale.set(this.scaleMul * 0.5);
      this.HPmarker.visible = false;
      this.addChild(this.HPmarker);
      // Prefer scorebar-* if skin provides it (osu! skins use scorebar-bg/colour), otherwise hpbar
      if (window.Skin?.["scorebar-bg.png"] && window.Skin?.["scorebar-colour.png"]) {
         this.HPbar[0].texture = window.Skin?.["scorebar-bg.png"];
         this.HPbar[1].texture = window.Skin?.["scorebar-bg.png"];
         this.HPbar[2].texture = window.Skin?.["scorebar-colour.png"];
         this.HPbar[0].anchor.x = 0;
         this._useScorebar = true;
         // Set up the HP marker (scorebar-ki)
         if (window.Skin?.["scorebar-ki.png"]) {
            this.HPmarker.texture = window.Skin?.["scorebar-ki.png"];
            this.HPmarker.visible = true;
            this._hasHPmarker = true;
         }
      } else {
         this.HPbar[0].texture = window.Skin?.["hpbarleft.png"];
         this.HPbar[1].texture = window.Skin?.["hpbarright.png"];
         this.HPbar[2].texture = window.Skin?.["hpbarmid.png"];
         this.HPbar[0].anchor.x = 1;
         this._useScorebar = false;
      }
       this.HPbar[0].scale.x = this.field.width / 500;
       this.HPbar[1].scale.x = this.field.width / 500;
       this.HPbar[0].y = 0;
       this.HPbar[1].y = 0;
       this.HPbar[2].y = 0;

      // value initialization ends

      this.resize = function (windowfield) {
         this.field = windowfield;
         this.scaleMul = windowfield.height / 800;

         let f = function (a, mul) {
            for (let i = 0; i < a.length; ++i) {
               a[i].scale.x = a[i].scale.y = mul;
            }
         };
         f(this.scoreDigits, this.scaleMul * 0.4);
         f(this.comboDigits, this.scaleMul * 0.2);
         f(this.accuracyDigits, this.scaleMul * 0.2);
         f(this.HPbar, this.scaleMul * 0.5);

          this.HPbar[0].scale.x = this.field.width / 500;
          this.HPbar[1].scale.x = this.field.width / 500;
          this.HPbar[0].y = 0;
          this.HPbar[1].y = 0;
          this.HPbar[2].y = 0;
      };

      // Lazer HP increase per judgement (from OsuHealthProcessor.getHealthIncreaseFor)
      this.HPincreasefor = function (result, maxresult) {
         const dr = this.HPdrain;
         // maxresult 300 = main judgement (circle/slider head), 10 = tick, 30 = edge
         if (maxresult === 10) {
            // slider tick
            return result > 0 ? lazerHpIncrease("SmallTickHit", dr) : lazerHpIncrease("SmallTickMiss", dr);
         }
         if (maxresult === 30) {
            // slider edge (repeat)
            return result > 0 ? lazerHpIncrease("LargeTickHit", dr, "SliderRepeat") : lazerHpIncrease("LargeTickMiss", dr);
         }
         // maxresult 300 = main judgement
         switch (result) {
            case 0:
               return lazerHpIncrease("Miss", dr);
            case 50:
               return lazerHpIncrease("Meh", dr);
            case 100:
               return lazerHpIncrease("Ok", dr);
            case 300:
               return lazerHpIncrease("Great", dr);
             default:
                return 0;
          }
      };

      // ── Lazer Score V2 typed pipe (D1 — audit finding) ───────────────────
      // scoreTyped(type, value, time, opts) — the lazer-faithful scoring path.
      // Mirrors score-math.js's makeScorer.scoreTyped exactly: accumulates the
      // comboPortion (Σ base(MaxResult)·comboAfter^0.5), maximumComboPortion
      // (perfect-play ceiling), bonusPortion, accuracyJudgementCount, then
      // recomputes this.score via computeTotalScore(acc, cp, ap, bp) × mult.
      // Called by SliderScorer (playback.js:1885) for slider parts when the
      // lazerSliderJudging flag is on, AND by hit() below for every judgement
      // when lazerScoreV2 is on. The HP delta is applied via the same
      // HPincreasefor path, plus the last-in-combo bonus (D3).
      // opts: { hit: bool, displayOnly: bool, hitObjectKind: string, part: string,
      //         lastInCombo: bool }
      this.scoreTyped = function (type, value, time, opts = {}) {
         const base = baseScoreFor(type);
         const hitNow = !!opts.hit;
         if (opts.displayOnly) return;
         const isBonus = type === "LargeBonus" || type === "SmallBonus";
         const affectsAcc = RESULT_ACCURACY.has(type);
         if (isBonus) {
            this.bonusPortion += value;
         } else if (affectsAcc) {
            this.judgeTotal += value;
            this.maxJudgeTotal += maxScoreFor(type);
         }
         // Combo tracking (IgnoreMiss/IgnoreHit don't touch combo)
         if (!isBonus && type !== "IgnoreMiss" && type !== "IgnoreHit") {
            if (hitNow) {
               this.combo += 1;
               this.comboPortion += base * Math.pow(this.combo, COMBO_EXPONENT);
            } else {
               this.combo = 0;
               this.fullcombo = false;
            }
         }
         this.maxcombo = Math.max(this.maxcombo, this.combo);
         this.accuracyJudgementCount += affectsAcc ? 1 : 0;
         // maximumComboPortion uses the larger of current combo / max combo seen,
         // so a perfect-play ceiling is stable even as combos break.
         this.maximumComboPortion += isBonus
            ? 0
            : base * Math.pow(this.combo > 0 ? this.combo : this.maxcombo || 1, COMBO_EXPONENT);
         this.maximumAccuracyJudgementCount += affectsAcc ? 1 : 0;
         // Lazer ComputeTotalScore: 500000·acc·cp + 500000·acc^5·ap + bp, × mult
         const acc = this.maxJudgeTotal ? this.judgeTotal / this.maxJudgeTotal : 1;
         const cp = this.maximumComboPortion > 0 ? this.comboPortion / this.maximumComboPortion : 1;
         const ap = this.maximumAccuracyJudgementCount > 0
            ? this.accuracyJudgementCount / this.maximumAccuracyJudgementCount : 1;
         this.score = Math.round(
            computeTotalScore(acc, cp, ap, this.bonusPortion) * this.scoreMultiplier
         );
         // HP for the typed result (D2: no cap; D3: last-in-combo bonus)
         if (this.HP >= 0) {
            let hpDelta = this._hpDeltaForType(type, opts);
            // D3: last-in-combo bonus. The tier is computed from the whole combo's
            // results (tracked in _comboHad*). Perfect = no Meh/Miss, Good = any
            // Ok/tail-miss/LargeTickMiss, None = any Meh/Miss.
            if (hitNow && opts.lastInCombo) {
               let tier = "None";
               if (!this._comboHadMeh && !this._comboHadMiss) {
                  tier = this._comboHadOk || this._comboHadTailMiss ? "Good" : "Perfect";
               }
               hpDelta += LAZER_LAST_COMBO_BONUS[tier];
               // Reset the per-combo tier trackers for the next combo
               this._comboHadMeh = false;
               this._comboHadMiss = false;
               this._comboHadOk = false;
               this._comboHadTailMiss = false;
            }
            // Track per-combo results for the tier
            if (type === "Meh" || type === "SmallTickMiss") this._comboHadMeh = true;
            if (type === "Miss" || type === "LargeTickMiss") this._comboHadMiss = true;
            if (type === "Ok") this._comboHadOk = true;
            if (type === "IgnoreMiss") this._comboHadTailMiss = true;
            this.HP += hpDelta;
         }
         this.HP = Math.min(1, this.HP);
         // judgecnt for the results screen
         if (type === "Great" || type === "Perfect") this.judgecnt.great++;
         else if (type === "Ok" || type === "Good") this.judgecnt.good++;
         else if (type === "Meh") this.judgecnt.meh++;
         else if (type === "Miss") this.judgecnt.miss++;
         // Display + fail checks
         this.score4display.set(time, this.score);
         this.combo4display.set(time, this.combo);
         this.accuracy4display.set(time, this.maxJudgeTotal > 0 ? this.judgeTotal / this.maxJudgeTotal : 1);
         this.HP4display.set(time, Math.max(0, this.HP));
         if (!this.failed) {
            let shouldFail = this.HP < 0;
            if (this.suddendeath && (type === "Miss" || type === "LargeTickMiss") ) shouldFail = true;
            if (this.perfect && hitNow && (type === "Meh" || type === "Ok")) shouldFail = true;
            if (this.nofail) {
               shouldFail = false;
               if (this.HP < 0) this.HP = 0;
            }
             if (shouldFail) {
                jlog.fail(this.HP, "hit-fail");
                this.failed = true;
               this.HP = -1;
               this.HP4display.set(time, 0);
               if (this.onfail) this.onfail();
            }
         }
      };

      // HP delta for a typed result (used by scoreTyped). Maps the lazer type
      // to lazerHpIncrease, using opts.hitObjectKind for the SliderTick vs
      // SliderRepeat distinction lazer makes on LargeTickHit.
      this._hpDeltaForType = function (type, opts = {}) {
         const dr = this.HPdrain;
         switch (type) {
            case "Miss": return lazerHpIncrease("Miss", dr);
            case "Meh": return lazerHpIncrease("Meh", dr);
            case "Ok": return lazerHpIncrease("Ok", dr);
            case "Great": case "Perfect": return lazerHpIncrease("Great", dr);
            case "Good": return lazerHpIncrease("Ok", dr); // Good is the 200-base in lazer (rare in osu!std)
            case "SmallTickHit": return lazerHpIncrease("SmallTickHit", dr);
            case "SmallTickMiss": return lazerHpIncrease("SmallTickMiss", dr);
            case "LargeTickHit":
               return lazerHpIncrease("LargeTickHit", dr, opts.hitObjectKind || "SliderRepeat");
            case "LargeTickMiss": return lazerHpIncrease("LargeTickMiss", dr);
            case "SliderTailHit": return lazerHpIncrease("SliderTailHit", dr);
            case "IgnoreMiss": return 0; // no HP impact for tail miss (lazer)
            case "IgnoreHit": return 0;
            case "SmallBonus": return lazerHpIncrease("SmallBonus", dr);
            case "LargeBonus": return lazerHpIncrease("LargeBonus", dr);
            default: return 0;
         }
      };

      // should be called when note is hit or missed
      // maxresult: 300 for a hitcircle / slider start & end of every repeat
      // maxresult: 10 for a tick
      // opts (optional, 4th arg): { lastInCombo: bool } — passed through to
      // scoreTyped for the D3 last-in-combo HP bonus when lazerScoreV2 is on.
      this.hit = function (result, maxresult, time, opts = {}) {
         // Lazer Score V2 path: route every judgement through scoreTyped so the
         // combo portion (Σ base·comboAfter^0.5) accumulates and the production
         // score uses the full lazer formula (D1 — audit finding).
         if (window.FEATURES && window.FEATURES.lazerScoreV2) {
            let type;
            if (maxresult === 300) {
               type = result === 300 ? "Great"
                    : result === 100 ? "Ok"
                    : result === 50 ? "Meh"
                    : "Miss";
            } else if (maxresult === 30) {
               type = result > 0 ? "LargeTickHit" : "LargeTickMiss";
            } else if (maxresult === 10) {
               type = result > 0 ? "SmallTickHit" : "SmallTickMiss";
            } else if (maxresult === 150) {
               type = result > 0 ? "SliderTailHit" : "IgnoreMiss";
            } else {
               // Unknown maxresult — fall through to legacy path
               type = null;
            }
            if (type) {
               this.scoreTyped(type, result, time, {
                  hit: result > 0,
                  lastInCombo: !!opts.lastInCombo,
                  hitObjectKind: opts.hitObjectKind,
               });
               // combo-break sound (preserved from legacy path)
               if (result === 0 && this.combo === 0) {
                  // (combo already reset inside scoreTyped)
               }
               return;
            }
         }
         // ── Legacy path (flag off, or classic mod) ──────────────────────────
         if (maxresult == 300) {
            if (result == 300) this.judgecnt.great++;
            if (result == 100) this.judgecnt.good++;
            if (result == 50) this.judgecnt.meh++;
            if (result == 0) this.judgecnt.miss++;
         }
         this.judgeTotal += result;
         this.maxJudgeTotal += maxresult;
         this.v1Score +=
            this.scoreMultiplier * result * (1 + this.combo / 25);
         // Classic mod = legacy combo-bloated V1; otherwise standardised V2
         // (base portion: 1,000,000 * accuracy * mod multiplier)
         this.score = this.classic
            ? this.v1Score
            : Math.round(
                  1000000 *
                     (this.maxJudgeTotal
                        ? this.judgeTotal / this.maxJudgeTotal
                        : 0) *
                     this.scoreMultiplier
               );
         // any zero-score result is a miss
         let oldCombo = this.combo;
         this.combo = result > 0 ? this.combo + 1 : 0;
         if (result == 0) {
            this.fullcombo = false;
            // combo creak
              if (oldCombo > 20) {
                 if (window.game.sampleComboBreak) {
                    window.game.sampleComboBreak.volume =
                       window.game.masterVolume * window.game.effectVolume;
                    window.game.sampleComboBreak.play();
                 }
              }
           }
         this.maxcombo = Math.max(this.maxcombo, this.combo);
          if (this.HP >= 0) {
             const hpDelta = this.HPincreasefor(result, maxresult);
             this.HP += hpDelta;
             jlog.hp(this.HP, hpDelta, "hit-" + result, time);
          }
         this.HP = Math.min(1, this.HP);

         this.score4display.set(time, this.score);
         this.combo4display.set(time, this.combo);
          this.accuracy4display.set(time, this.maxJudgeTotal > 0 ? this.judgeTotal / this.maxJudgeTotal : 1);
         this.HP4display.set(time, Math.max(0, this.HP));

         // fail conditions (lazer-style mods); only count hit-object (maxresult 300) results
         if (!this.failed) {
            let shouldFail = this.HP < 0;
            if (this.suddendeath && maxresult === 300 && result === 0)
               shouldFail = true;
            if (this.perfect && maxresult === 300 && result > 0 && result < 300)
               shouldFail = true;
            if (this.nofail) {
               shouldFail = false;
               if (this.HP < 0) this.HP = 0;
            }
             if (shouldFail) {
                jlog.fail(this.HP, "hit-fail");
                this.failed = true;
               this.HP = -1;
               this.HP4display.set(time, 0);
               if (this.onfail) this.onfail();
            }
         }
      };

      this.charspacing = 12; // in texture pixel (was 10, increased to reduce overlapping)

      this._measureLogged = false;
      this.setSpriteArrayText = function (arr, str) {
         // dirty-check: skip all texture/width work if string unchanged since last frame
         if (arr._lastStr === str) { arr.width = arr._lastWidth; return; }
         arr._lastStr = str;
         let width = 0;
         // Truncate over-long strings instead of erroring
         const displayStr = str.length > arr.length ? str.slice(-arr.length) : str;
         let rawPrefix = (window.game && window.game.skinConfig && window.game.skinConfig.scorePrefix) || "score";
         const prefixBase = rawPrefix.split("/").pop() || rawPrefix;
         let prefix = prefixBase;
         const overlap = (window.game && window.game.skinConfig && window.game.skinConfig.scoreOverlap) || 0;
         // keep charspacing 12, respect ScoreOverlap exactly (osu! spec), no forced score-0
         const baseEff = this.charspacing - overlap;
         const getOrigWidth = (t) => {
            if (!t) return null;
            if (t.orig?.width) return t.orig.width / (t.source?.resolution || 1);
            if (t.source?.width) return t.source.width / (t.source.resolution || 1);
            return t.width || null;
         };
         for (let i = 0; i < displayStr.length; ++i) {
            let ch = displayStr[i];
            if (ch == "%") ch = "percent";
            let cand = prefix === "default" ? ch + ".png" : prefix + "-" + ch + ".png";
            let textname = (window.Skin && window.Skin[cand]) ? cand : "score-" + ch + ".png";
            if (!window.Skin || !window.Skin[textname]) textname = (window.Skin && window.Skin[ch + ".png"]) ? ch + ".png" : "score-" + ch + ".png";
            const tex = window.Skin?.[textname] || PIXI.Texture.WHITE;
            arr[i].texture = tex;
            let w = getOrigWidth(tex);
            if (!w || !tex.valid) {
               const fallback = window.Skin?.["score-0.png"];
               w = getOrigWidth(fallback) || 14;
            }
            const is2x = tex?.source?.resolution === 2;
            const effSpacing = baseEff + (is2x ? 1 : 0);
            // Defensive: if scale.x is not a number (e.g. reset to default 1 in
            // some edge case) or arr[i] is missing, clamp to 0 to avoid NaN.
            const sx = (typeof arr[i].scale.x === "number") ? arr[i].scale.x : 1;
            arr[i].knownwidth = sx * (w + effSpacing);
            arr[i].visible = true;
            width += arr[i].knownwidth;
         }
         for (let i = displayStr.length; i < arr.length; ++i) {
            arr[i].visible = false;
         }
         arr.width = width;
         arr._lastWidth = width;
         arr.useLength = displayStr.length;
      };

      this.setSpriteArrayPos = function (arr, x, y) {
         let curx = x;
         // Defensive: a corrupt or empty sprite array would otherwise throw a
         // string exception that halts the render loop. Just early-return.
         if (!arr || !(arr.useLength > 0)) return;
         const overlap = (window.game && window.game.skinConfig && window.game.skinConfig.scoreOverlap) || 0;
         const effSpacing = this.charspacing - overlap;
         for (let i = 0; i < arr.useLength; ++i) {
            const sx = (typeof arr[i].scale.x === "number") ? arr[i].scale.x : 1;
            arr[i].x = curx + (sx * effSpacing) / 2;
            arr[i].y = y;
            curx += arr[i].knownwidth;
         }
      };

      this.update = function (time) {
         if (Number.isNaN(time)) {
            console.error("score overlay update with time = NaN");
            return;
         }
          // passive HP drain (lazer): drains over time while playing.
          // Does NOT drain during:
          // - lead-in / countdown (time < drainStart)
          // - breaks (gap > 1500ms before next hit object — lazer pauses drain)
          // - after the map ends (time > drainEnd)
          // - scrub frames (clock jumped — don't penalize for seek)
          if (this.lastDrainTime < 0) this.lastDrainTime = time;
          let dt = time - this.lastDrainTime;
          this.lastDrainTime = time;
          const drainStart = this.field && this.field._drainStart || 0;
          const drainEnd = this.field && this.field._drainEnd || Infinity;
          // Check if we're in a break period (gap before next hit > 1500ms).
          // The break overlay uses the same threshold (appearthreshold = 1500).
          // During breaks, HP stays the same (lazer: DrainingHealthProcessor
          // uses noDrainPeriods for break periods).
          const nextApproach = this.field && this.field._nextApproachTime;
          const inBreak = nextApproach != null && (nextApproach - time) > 1500 && time > drainStart;
          if (!this.failed && time >= drainStart && time <= drainEnd && dt > 0 && dt < 1000 && !inBreak) {
              this.HP -= this.passiveDrain * dt;
              jlog.hp(this.HP, -this.passiveDrain * dt, "drain", time);
              if (this.HP < 0) {
                 if (this.nofail) {
                    this.HP = 0;
                 } else {
                    jlog.fail(this.HP, "drain-fail");
                    this.failed = true;
                   this.HP = -1;
                   if (this.onfail) this.onfail();
                }
             }
             this.HP4display.set(time, Math.max(0, this.HP));
          }
         let hp = this.HP4display.valueAt(time);
          if (this._useScorebar) {
              // scorebar: bg full width, colour width = hp * width
              this.HPbar[0].x = 0; this.HPbar[0].width = this.field.width;
              this.HPbar[1].x = 0; this.HPbar[1].width = this.field.width;
              this.HPbar[2].x = 0; this.HPbar[2].width = Math.max(0, hp) * this.field.width;
              // Position the HP marker (scorebar-ki) at the right edge of the fill
              if (this._hasHPmarker) {
                 this.HPmarker.x = Math.max(0, hp) * this.field.width;
                 this.HPmarker.y = this.HPbar[2].y;
                 // Swap to danger variant when HP < 25%
                 if (hp < 0.25 && window.Skin?.["scorebar-kidanger2.png"]) {
                    if (this.HPmarker.texture !== window.Skin?.["scorebar-kidanger2.png"])
                       this.HPmarker.texture = window.Skin?.["scorebar-kidanger2.png"];
                 } else if (hp < 0.5 && window.Skin?.["scorebar-kidanger.png"]) {
                    if (this.HPmarker.texture !== window.Skin?.["scorebar-kidanger.png"])
                       this.HPmarker.texture = window.Skin?.["scorebar-kidanger.png"];
                 } else {
                    if (this.HPmarker.texture !== window.Skin?.["scorebar-ki.png"])
                       this.HPmarker.texture = window.Skin?.["scorebar-ki.png"];
                 }
              }
         } else {
            let HPpos = hp * this.field.width;
            this.HPbar[0].x = HPpos;
            this.HPbar[1].x = HPpos;
            this.HPbar[2].x = HPpos;
         }

         this.setSpriteArrayText(
            this.scoreDigits,
            Math.round(this.score4display.valueAt(time))
               .toString()
               .padStart(6, "0")
         );
         this.setSpriteArrayText(
            this.comboDigits,
            Math.round(this.combo4display.valueAt(time)).toString() + "x"
         );
         this.setSpriteArrayText(
            this.accuracyDigits,
            (this.accuracy4display.valueAt(time) * 100).toFixed(2) + "%"
         );

         let basex = this.field.width * 0.5;
         let basey = this.field.height * 0.017;
         let unit = Math.min(this.field.width / 640, this.field.height / 480);
         this.setSpriteArrayPos(
            this.scoreDigits,
            basex - this.scoreDigits.width / 2,
            basey
         );
         this.setSpriteArrayPos(
            this.accuracyDigits,
            basex -
               this.scoreDigits.width / 2 -
               this.accuracyDigits.width -
               16 * unit,
            basey + 3 * unit
         );
         this.setSpriteArrayPos(
            this.comboDigits,
            basex + this.scoreDigits.width / 2 + 16 * unit,
            basey + 3 * unit
         );
      };

      // Discord webhook via proxied :8080 — replaces legacy catboy.best GET
      function uploadScore(summary) {
         // Forward score to our backend which will relay to Discord if webhook is configured.
         // Uses same-origin /api/webhook/score which Fly proxies to :8080 and then to Discord.
         const payload = {
            // Discord-compatible: content + embeds
            username: "webosu",
            content: `**${summary.player || "Unknown"}** scored **${summary.score}** on **${summary.artist} - ${summary.title} [${summary.version}]**`,
            embeds: [{
               title: `${summary.artist} - ${summary.title} [${summary.version}]`,
               description: `**${summary.grade}** • ${summary.score} • ${summary.acc} • ${summary.combo}x`,
               color: summary.grade === "SS" || summary.grade === "S" ? 0xFFD966 : summary.grade === "A" ? 0x66CC66 : 0x4AA3E8,
               fields: [
                  { name: "Player", value: String(summary.player || "Unknown"), inline: true },
                  { name: "Mods", value: summary.mods || "None", inline: true },
                  { name: "Grade", value: summary.grade, inline: true },
                  { name: "Great/Good/Meh/Miss", value: `${summary.count300}/${summary.count100}/${summary.count50}/${summary.misses}`, inline: false },
               ],
               timestamp: new Date(summary.time).toISOString(),
            }],
            // also include raw summary for our backend's /api/scores logic
            _webosu: summary,
         };
         fetch("/api/webhook/score", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
         }).then(r => r.json().catch(()=>({}))).then(d => {
            if (d && d.error) { if (import.meta.env.DEV) console.warn("[score] webhook relay:", d.error); }
            else if (import.meta.env.DEV) console.log("[score] webhook relay ok");
         }).catch(e => { if (import.meta.env.DEV) console.warn("[score] webhook failed", e); });
         // also keep local webosu leaderboard submission (handled below via WebosuAPI.submitScore)
      }

      this.showSummary = function (
         metadata,
         hiterrors,
         retryCallback,
         quitCallback
      ) {
         function errortext(a) {
            if (!a || !a.length) return "—";
            let sum = 0;
            for (let i = 0; i < a.length; ++i) sum += a[i];
            let avg = sum / a.length;
            let sumsqerr = 0;
            for (let i = 0; i < a.length; ++i)
               sumsqerr += (a[i] - avg) * (a[i] - avg);
            let variance = sumsqerr / a.length;
            let stdev = Math.sqrt(variance);
            let sgnavg = avg.toFixed(0);
            if (sgnavg[0] != "-") sgnavg = "+" + sgnavg;
            return sgnavg + "±" + stdev.toFixed(0) + "ms";
         }

         function modstext(game) {
            // v2: use ModRegistry.serializeDisplay() (all mods), fallback to flat flags
            if (window.ModRegistry && window.ModRegistry.serializeDisplay) {
               return window.ModRegistry.serializeDisplay();
            }
            let l = [];
            if (game.easy) l.push("EZ");
            if (game.daycore) l.push("DC");
            if (game.hidden) l.push("HD");
            if (game.hardrock) l.push("HR");
            if (game.nightcore) l.push("NC");
            if (game.autoplay) l.push("AT");
            if (game.nofail) l.push("NF");
            if (game.suddendeath) l.push("SD");
            if (game.perfect) l.push("PF");
            if (game.spunout) l.push("SO");
            if (game.classic) l.push("CL");
            if (game.difficultyAdjust) l.push("DA");
            if (l.length == 0) return "";
            let s = l[0];
            for (let i = 1; i < l.length; ++i) s = s + "+" + l[i];
            return s;
         }

         function modsEnum(game) {
            // v2: use ModRegistry.toBitmask() (all mods), fallback to flat flags
            if (window.ModRegistry && window.ModRegistry.toBitmask) {
               return window.ModRegistry.toBitmask();
            }
            let num = 0;
            if (game.easy) num += 2;
            if (game.hidden) num += 8;
            if (game.hardrock) num += 16;
            if (game.nightcore) num += 64;
            if (game.daycore) num += 256;
            if (game.nofail) num += 1;
            if (game.suddendeath) num += 32;
            if (game.perfect) num += 16384;
            if (game.spunout) num += 4096;
            return num;
         }

         function newdiv(parent, classname, text) {
            let div = document.createElement("div");
            if (parent) parent.appendChild(div);
            if (classname) div.className = classname;
            if (text) div.innerText = text;
            return div;
         }
         let acc = this.maxJudgeTotal > 0 ? this.judgeTotal / this.maxJudgeTotal : 1;
         // Lazer: silver SS/S for FC + (HD or FL)
         const _hasHdOrFl = !!(window.ModRegistry && (window.ModRegistry.isActive("HD") || window.ModRegistry.isActive("FL")));
         let rank = this.HP < 0 ? "F" : grade(acc, this.fullcombo, _hasHdOrFl);
         let grading = document.createElement("div");
         grading.className = "grading transparent";
         document.body.appendChild(grading);

         // osu!lazer-style results screen
         let panel = newdiv(grading, "results-panel");

         // header: beatmap info
         let header = newdiv(panel, "results-header");
         newdiv(header, "results-title", metadata.Title);
         newdiv(header, "results-subtitle", metadata.Artist + " [" + metadata.Version + "]");
         newdiv(header, "results-mapper", "mapped by " + metadata.Creator);
         let modsStr = modstext(window.game);
         if (modsStr) newdiv(header, "results-mods", modsStr);

         // grade
         let gradeEl = newdiv(panel, "results-grade " + rank);
         gradeEl.textContent = rank;

         // main stats row
         let statsRow = newdiv(panel, "results-stats");
         let s1 = newdiv(statsRow, "results-stat"); s1.innerHTML = '<span class="stat-num">' + Math.round(this.score).toLocaleString() + '</span><span class="stat-label">score</span>';
         let s2 = newdiv(statsRow, "results-stat"); s2.innerHTML = '<span class="stat-num">' + (acc * 100).toFixed(2) + '%</span><span class="stat-label">accuracy</span>';
         let s3 = newdiv(statsRow, "results-stat"); s3.innerHTML = '<span class="stat-num">' + this.maxcombo + 'x</span><span class="stat-label">max combo</span>';

         // hit breakdown
         let hits = newdiv(panel, "results-hits");
         let h300 = newdiv(hits, "hit-stat great"); h300.innerHTML = '<span class="hit-num">' + this.judgecnt.great + '</span><span class="hit-label">300</span>';
         let h100 = newdiv(hits, "hit-stat good"); h100.innerHTML = '<span class="hit-num">' + this.judgecnt.good + '</span><span class="hit-label">100</span>';
         let h50 = newdiv(hits, "hit-stat meh"); h50.innerHTML = '<span class="hit-num">' + this.judgecnt.meh + '</span><span class="hit-label">50</span>';
         let hMiss = newdiv(hits, "hit-stat miss"); hMiss.innerHTML = '<span class="hit-num">' + this.judgecnt.miss + '</span><span class="hit-label">miss</span>';

         // extra info — Offset (was UR), PP, stars + FC + autocalibrate
         let extra = newdiv(panel, "results-extra");
         const offsetText = errortext(hiterrors);
         // change UR to Offset per user request
         const offsetDiv = newdiv(extra, "results-ur", "Offset: " + offsetText);
         let starsBlock = newdiv(extra, "results-stars", "★ …");
         let ppBlock = newdiv(extra, "results-pp", "PP …");
         if (this.fullcombo) newdiv(extra, "results-fc", "Full Combo");
         // autocalibrate audio offset based on average hit error (reduce latency misinput)
         try {
            if (hiterrors && hiterrors.length >= 5) {
               let sum = 0; for (let i=0;i<hiterrors.length;i++) sum+=hiterrors[i];
               const avg = sum / hiterrors.length;
                if (Math.abs(avg) >= 3 && Math.abs(avg) <= 45) {
                   const gs = window.gamesettings;
                   if (gs) {
                      const cur = parseFloat(gs.audiooffset) || 0;
                      // lazer-style: nudge offset by 20% of average error (conservative, gradual)
                      const delta = Math.round(-avg * 0.2);
                      const next = Math.max(-200, Math.min(200, cur + delta));
                     if (next !== cur) {
                        gs.audiooffset = next;
                        gs.save && gs.save();
                        if (gs.loadToGame) gs.loadToGame();
                        offsetDiv.title = `Auto-calibrated audio offset ${cur}→${next}ms (avg ${avg.toFixed(1)}ms)`;
                        offsetDiv.innerText += ` → audio offset ${next}ms`;
                        if (import.meta.env.DEV) console.log(`[score] autocalibrate offset ${cur} -> ${next} (avg ${avg.toFixed(1)}ms)`);
                     }
                  }
               }
            }
         } catch (e) { if (import.meta.env.DEV) console.warn("[score] autocalibrate failed", e); }

         // buttons
         let btns = newdiv(panel, "results-buttons");
         let bRetry = newdiv(btns, "rbtn retry"); bRetry.textContent = "Retry";
         bRetry.onclick = function () { grading.remove(); retryCallback(); };
         let bQuit = newdiv(btns, "rbtn quit"); bQuit.textContent = "Quit";
         bQuit.onclick = function () { grading.remove(); quitCallback(); };
         let bLB = newdiv(btns, "rbtn leaderboard"); bLB.textContent = "Leaderboard";
         bLB.onclick = function () {
            window.open("leaderboard-v2.html?bid=" + encodeURIComponent(metadata.BeatmapID || "") + "&mods=" + modsEnum(window.game), "_blank");
         };
         let bProf = newdiv(btns, "rbtn profile"); bProf.textContent = "Profile";
         bProf.onclick = function () {
            // Read the logged-in username from the webosu_user JSON blob (login writes
            // it via API.register/login) with a fallback to the legacy raw
            // "username" key for back-compat. If neither is present, the link
            // still opens to the home page instead of `?u=undefined`.
            let u = "";
            try {
               const raw = window.localStorage.getItem("webosu_user");
               if (raw) { const p = JSON.parse(raw); u = (p && p.username) || ""; }
            } catch {}
            if (!u) { try { u = window.localStorage.getItem("username") || ""; } catch {} }
            window.open("profile-v2.html?u=" + encodeURIComponent(u), "_blank");
         };
         if (window.lastPlayedOszBlob && window.playback && window.playback.replayFrames && window.playback.replayFrames.length) {
            let bReplay = newdiv(btns, "rbtn watch"); bReplay.textContent = "Watch replay";
            bReplay.onclick = function () {
               var rf = window.playback.replayFrames;
               grading.remove();
               quitCallback();
               launchReplay(window.lastPlayedOszBlob, window.lastPlayedBeatmapId, window.lastPlayedVersion, rf);
            };
         }

         // PP + stars — backend now uses rosu-pp-js (accurate), frontend just displays
         // Stars from rosu-pp if we have the beatmap, otherwise from catboy's estimate
         let starsVal = window.lastPlayedStars;
         if (starsVal != null) starsBlock.innerText = `★ ${Number(starsVal).toFixed(2)}`;
         else starsBlock.innerText = "★ ?";
          if (window.WebosuAPI) {
             const mods = modsEnum(window.game);
             // v2: also send the ModRegistry's mod acronym list for lazer-mode PP
             const modsList = (window.ModRegistry && window.ModRegistry.serialize) ? window.ModRegistry.serialize() : null;
             // Try to get accurate PP from backend which now uses rosu-pp if _osu available
             const payload = { stars: starsVal != null ? Number(starsVal) : 0, acc: acc * 100, combo: this.maxcombo, maxCombo: this.maxcombo, modsNum: mods, modsList, c300: this.judgecnt.great, c100: this.judgecnt.good, c50: this.judgecnt.meh, miss: this.judgecnt.miss };
             // If we have the raw .osu, also send it for server-side rosu calculation (more accurate)
             const rawOsu = window.playback && window.playback.track && window.playback.track.track;
             if (rawOsu && rawOsu.length < 500000) {
                // Use new rosu endpoint if available (POST with osu text) — v2 sends modsList for lazer mode
                fetch("/api/pp/rosu", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ osu: rawOsu, mods, modsList, accuracy: acc*100, combo: this.maxcombo, n300: this.judgecnt.great, n100: this.judgecnt.good, n50: this.judgecnt.meh, misses: this.judgecnt.miss }) })
                 .then(r => r.json()).then(r => {
                    if (r && r.pp != null) ppBlock.innerText = `PP ${Math.round(r.pp)}`;
                    if (r && r.stars != null) starsBlock.innerText = `★ ${Number(r.stars).toFixed(2)}`;
                    else if (window.lastPlayedStars == null) starsBlock.innerText = "★ ?";
                    if (r && r.pp == null) throw new Error("no pp");
                 }).catch(() => {
                    // fallback to legacy estimate
                    WebosuAPI.ppEstimate(payload).then(r => { ppBlock.innerText = `PP ${r && r.pp != null ? Math.round(r.pp) : "?"}`; }).catch(()=> ppBlock.innerText = "PP ?");
                 });
            } else {
               WebosuAPI.ppEstimate(payload).then(r => { ppBlock.innerText = `PP ${r && r.pp != null ? Math.round(r.pp) : "?"}`; }).catch(()=> ppBlock.innerText = "PP ?");
            }
         } else {
            ppBlock.innerText = "PP ?";
         }

         window.setTimeout(function () { grading.classList.remove("transparent"); }, 100);
                  // generate summary data
         let summary = {
            // Coerce ids to numbers (some beatmaps leave them as strings).
            sid: parseInt(metadata.BeatmapSetID, 10) || 0,
            bid: parseInt(metadata.BeatmapID, 10) || 0,
            title: metadata.Title || "Untitled",
            artist: metadata.Artist || "Unknown artist",
            // Use the logged-in username from the webosu_user JSON blob
            // (matches what gets posted to the leaderboard), falling back to
            // legacy "username" for back-compat, then metadata.Player.
            player: (function () {
               try {
                  const raw = window.localStorage.getItem("webosu_user");
                  if (raw) { const p = JSON.parse(raw); if (p && p.username) return p.username; }
               } catch {}
               try { const u = window.localStorage.getItem("username"); if (u) return u; } catch {}
               return metadata.Player || "guest";
            })(),
            version: metadata.Version || "",
            mods: modstext(window.game),
            modsNum: modsEnum(window.game),
            count300: this.judgecnt.great,
            count100: this.judgecnt.good,
            count50: this.judgecnt.meh,
            misses: this.judgecnt.miss,
            grade: rank,
            score: Math.round(this.score).toString(),
            combo: this.maxcombo.toString(),
            acc: (acc * 100).toFixed(2) + "%",
            time: new Date().getTime(),
         };
         const isFailed = rank === "F" || this.failed;
         const isReplay = !!(window.game && window.game.replayMode);
         // helper to actually post (used for non-fails auto, and for fails via button)
         const doPost = () => {
            uploadScore(summary);
            if (window.WebosuAPI && WebosuAPI.isLoggedIn()) {
               try {
                   WebosuAPI.submitScore({
                      beatmap_id: parseInt(summary.bid, 10) || 0,
                      beatmap_set_id: parseInt(summary.sid, 10) || 0,
                      title: summary.title,
                      artist: summary.artist,
                      version: summary.version,
                      mods: summary.mods,
                      modsNum: modsEnum(window.game),
                     mods_list: (window.ModRegistry && window.ModRegistry.serialize) ? window.ModRegistry.serialize() : null,
                     ruleset_version: "lazer-v1",
                     score: parseInt(summary.score, 10) || 0,
                     combo: parseInt(summary.combo, 10) || 0,
                     acc: parseFloat(summary.acc) || 0,
                     grade: summary.grade,
                     count300: summary.count300,
                     count100: summary.count100,
                     count50: summary.count50,
                     miss: summary.misses,
                     replay: (window.playback && window.playback.replayFrames) || null,
                     beatmap: (function () {
                        const t = window.playback && window.playback.track;
                        if (!t || !t.hitObjects) return null;
                        return {
                           od: t.difficulty && t.difficulty.OverallDifficulty,
                           cs: t.difficulty && t.difficulty.CircleSize,
                           hitObjects: t.hitObjects.slice(0, 12000).map(function (h) {
                              return { time: h.time, x: h.x, y: h.y, type: h.type, endTime: h.endTime };
                           }),
                        };
                     })(),
                  });
               } catch (e) {
                  if (import.meta.env.DEV) console.warn("webosu score submit failed", e);
                  // Surface the failure through the foreground ErrorPopup so the
                  // user isn't left wondering why their score didn't show up.
                  if (typeof window.__showErrorPopup === "function") {
                     try { window.__showErrorPopup("Score submission failed: " + (e.message || e), "Could not post score"); } catch {}
                  }
               }
            }
         };
         if (!isReplay) addPlayHistory(summary);
         if (!isReplay && !isFailed) {
            doPost();
         } else if (!isReplay && isFailed) {
            // Fail: show private message + Post anyways button, don't auto-post
            const failMsg = newdiv(panel, "results-fail-msg");
            failMsg.style.cssText = "margin-top:10px;padding:10px 14px;background:rgba(225,85,85,0.12);border:1px solid rgba(225,85,85,0.3);border-radius:10px;color:var(--color-lazer-text);font-size:0.85em;text-align:center;max-width:520px;";
            failMsg.innerText = "Aw man, You failed. This score will be kept private and won't be posted or show on leaderboards... Unless you'd rather humiliate yourself lol";
            const postBtn = newdiv(panel, "rbtn post-anyways");
            postBtn.textContent = "Post anyways";
            postBtn.style.cssText = "margin-top:8px;background:rgba(225,85,85,0.9);color:#fff;border:none;";
            // insert postBtn into the same button row for consistent layout
            const btnRow = panel.querySelector(".results-buttons");
            if (btnRow) btnRow.appendChild(postBtn);
            else panel.appendChild(postBtn);
            let posted = false;
            postBtn.onclick = function () {
               if (posted) return;
               posted = true;
               postBtn.textContent = "Posting...";
               postBtn.style.opacity = "0.7";
               postBtn.style.pointerEvents = "none";
               // Capture submitScore's promise so a real network failure surfaces
               // through the foreground ErrorPopup rather than a silent console.warn.
               // doPost() is fire-and-forget, so we re-issue submitScore here to get
               // a promise, and call doPost() purely for the uploadScore side-effect.
               try {
                  if (window.WebosuAPI && WebosuAPI.isLoggedIn() && typeof WebosuAPI.submitScore === "function") {
                     WebosuAPI.submitScore({
                        beatmap_id: parseInt(summary.bid, 10) || 0,
                        beatmap_set_id: parseInt(summary.sid, 10) || 0,
                        title: summary.title,
                        artist: summary.artist,
                        version: summary.version,
                        mods: summary.mods,
                        modsNum: modsEnum(window.game),
                        mods_list: (window.ModRegistry && window.ModRegistry.serialize) ? window.ModRegistry.serialize() : null,
                        ruleset_version: "lazer-v1",
                        score: parseInt(summary.score, 10) || 0,
                        combo: parseInt(summary.combo, 10) || 0,
                        acc: parseFloat(summary.acc) || 0,
                        grade: summary.grade,
                        count300: summary.count300,
                        count100: summary.count100,
                        count50: summary.count50,
                        miss: summary.misses,
                     }).then(() => {
                        postBtn.textContent = "Posted!";
                        failMsg.innerText = "Your fail is now public. Respect for owning it.";
                     }).catch((err) => {
                        postBtn.textContent = "Post anyways";
                        postBtn.style.opacity = "1";
                        postBtn.style.pointerEvents = "auto";
                        posted = false;
                        if (typeof window.__showErrorPopup === "function") {
                           window.__showErrorPopup("Score submission failed: " + (err.message || err), "Could not post score");
                        }
                     });
                  }
                  // Also run the legacy uploadScore() path for playHistory / replay.
                  try { doPost(); } catch (e) { if (import.meta.env.DEV) console.warn("post anyways inner failed", e); }
               } catch (e) {
                  if (import.meta.env.DEV) console.warn("post anyways failed", e);
                  if (typeof window.__showErrorPopup === "function") {
                     window.__showErrorPopup("Score submission failed: " + (e.message || e), "Could not post score");
                  }
                  postBtn.textContent = "Post anyways";
                  postBtn.style.opacity = "1";
                  postBtn.style.pointerEvents = "auto";
                  posted = false;
               }
            };
         }
         // show history best
         if (window.localforage && summary.bid) {
            window.localforage.getItem("historybest", function (err, val) {
               if (err) return;
               let historybest = 0;
               if (val && val.size) {
                  historybest = val.get(summary.bid) || 0;
               }
               newdiv(extra, "results-best", historybest.toString());
               if (parseInt(summary.score) > historybest) {
                  if (!val || !val.size) val = new Map();
                  val.set(summary.bid, parseInt(summary.score));
                  window.localforage.setItem(
                     "historybest",
                     val,
                     function (err, val) {
                        if (err) console.error("failed saving best score");
                     }
                  );
               }
            });
         }
      };
    
  }
}
export default ScoreOverlay;
