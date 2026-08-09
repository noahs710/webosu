
   function addPlayHistory(summary) {
      if (!window.playHistory1000) {
         window.playHistory1000 = [];
      }
      window.playHistory1000.push(summary);
      if (window.playHistory1000.length > 1000) window.playHistory1000.shift();
      // save history
      if (window.localforage) {
         localforage.setItem(
            "playhistory1000",
            window.playHistory1000,
            function (err, val) {
               if (err) {
                  console.error("Error saving play history");
               }
            }
         );
      }
   }

   function grade(acc) {
      if (acc >= 1) return "SS";
      if (acc >= 0.95) return "S";
      if (acc >= 0.9) return "A";
      if (acc >= 0.8) return "B";
      if (acc >= 0.7) return "C";
      return "D";
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
      this.passiveDrain = 0.00001 * (HPdrain || 0);

      this.score = 0; // this have been multiplied by scoreMultiplier
      this.combo = 0;
      this.maxcombo = 0;
      this.judgeTotal = 0;
      this.maxJudgeTotal = 0;
      this.HP = 1;
      this.fullcombo = true;
      // accuracy = judgeTotal / maxJudgeTotal

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
      // Prefer scorebar-* if skin provides it (osu! skins use scorebar-bg/colour), otherwise hpbar
      if (Skin["scorebar-bg.png"] && Skin["scorebar-colour.png"]) {
         this.HPbar[0].texture = Skin["scorebar-bg.png"];
         this.HPbar[1].texture = Skin["scorebar-bg.png"];
         this.HPbar[2].texture = Skin["scorebar-colour.png"];
         this.HPbar[0].anchor.x = 0;
         this._useScorebar = true;
      } else {
         this.HPbar[0].texture = Skin["hpbarleft.png"];
         this.HPbar[1].texture = Skin["hpbarright.png"];
         this.HPbar[2].texture = Skin["hpbarmid.png"];
         this.HPbar[0].anchor.x = 1;
         this._useScorebar = false;
      }
      this.HPbar[0].scale.x = this.field.width / 500;
      this.HPbar[1].scale.x = this.field.width / 500;
      this.HPbar[0].y = -7 * this.scaleMul;
      this.HPbar[1].y = -7 * this.scaleMul;
      this.HPbar[2].y = -7 * this.scaleMul;

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
         this.HPbar[0].y = -7 * this.scaleMul;
         this.HPbar[1].y = -7 * this.scaleMul;
         this.HPbar[2].y = -7 * this.scaleMul;
      };

      this.HPincreasefor = function (result) {
         switch (result) {
            case 0:
               return -0.02 * this.HPdrain;
            case 50:
               return 0.01 * (4 - this.HPdrain);
            case 100:
               return 0.01 * (8 - this.HPdrain);
            case 300:
               return 0.01 * (10.2 - this.HPdrain);
            default:
               return 0;
         }
      };

      // should be called when note is hit or missed
      // maxresult: 300 for a hitcircle / slider start & end of every repeat
      // maxresult: 10 for a tick
      this.hit = function (result, maxresult, time) {
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
               // play combo break sound
               window.game.sampleComboBreak.volume =
                  window.game.masterVolume * window.game.effectVolume;
               window.game.sampleComboBreak.play();
            }
         }
         this.maxcombo = Math.max(this.maxcombo, this.combo);
         if (this.HP >= 0) this.HP += this.HPincreasefor(result);
         this.HP = Math.min(1, this.HP);

         this.score4display.set(time, this.score);
         this.combo4display.set(time, this.combo);
         this.accuracy4display.set(time, this.judgeTotal / this.maxJudgeTotal);
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
               this.failed = true;
               this.HP = -1;
               this.HP4display.set(time, 0);
               if (this.onfail) this.onfail();
            }
         }
      };

      this.charspacing = 10; // in texture pixel

      this.setSpriteArrayText = function (arr, str) {
         let width = 0;
         if (str.length > arr.length) console.error("displaying string failed");
         let prefix = (window.game && window.game.skinConfig && window.game.skinConfig.scorePrefix) || "score";
         const overlap = (window.game && window.game.skinConfig && window.game.skinConfig.scoreOverlap) || 0;
         const effSpacing = this.charspacing - overlap;
         for (let i = 0; i < str.length; ++i) {
            let ch = str[i];
            if (ch == "%") ch = "percent";
            let cand = prefix === "default" ? ch + ".png" : prefix + "-" + ch + ".png";
            let textname = (window.Skin && window.Skin[cand]) ? cand : "score-" + ch + ".png";
            // fallback to digit naming if score- variant missing
            if (!window.Skin || !window.Skin[textname]) textname = (window.Skin && window.Skin[ch + ".png"]) ? ch + ".png" : "score-" + ch + ".png";
            arr[i].texture = Skin[textname];
            arr[i].knownwidth =
               arr[i].scale.x * (Skin[textname].width + effSpacing);
            arr[i].visible = true;
            width += arr[i].knownwidth;
         }
         for (let i = str.length; i < arr.length; ++i) {
            arr[i].visible = false;
         }
         arr.width = width;
         arr.useLength = str.length;
      };

      this.setSpriteArrayPos = function (arr, x, y) {
         let curx = x;
         if (arr.useLength <= 0) throw "wtf!";
         const overlap = (window.game && window.game.skinConfig && window.game.skinConfig.scoreOverlap) || 0;
         const effSpacing = this.charspacing - overlap;
         for (let i = 0; i < arr.useLength; ++i) {
            arr[i].x = curx + (arr[i].scale.x * effSpacing) / 2;
            arr[i].y = y;
            curx += arr[i].knownwidth;
         }
      };

      this.update = function (time) {
         if (Number.isNaN(time)) {
            console.error("score overlay update with time = NaN");
            return;
         }
         // passive HP drain (lazer): drains over time while playing
         if (this.lastDrainTime < 0) this.lastDrainTime = time;
         let dt = time - this.lastDrainTime;
         this.lastDrainTime = time;
         if (!this.failed && time >= 0 && dt > 0 && dt < 1000) {
            this.HP -= this.passiveDrain * dt;
            if (this.HP < 0) {
               if (this.nofail) {
                  this.HP = 0;
               } else {
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
            this.HPbar[0].x = 0; this.HPbar[0].width = this.field.width; this.HPbar[0].scale.x = this.field.width / this.HPbar[0].texture.width;
            this.HPbar[1].x = 0; this.HPbar[1].width = this.field.width;
            this.HPbar[2].x = 0; this.HPbar[2].width = Math.max(0, hp) * this.field.width; this.HPbar[2].scale.x = (Math.max(0, hp) * this.field.width) / this.HPbar[2].texture.width;
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
            if (d && d.error) console.warn("[score] webhook relay:", d.error);
            else console.log("[score] webhook relay ok");
         }).catch(e => console.warn("[score] webhook failed", e));
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
         let acc = this.judgeTotal / this.maxJudgeTotal;
         let rank = this.HP < 0 ? "F" : grade(acc);
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

         // extra info — UR, PP, stars (rosu-pp) + FC
         let extra = newdiv(panel, "results-extra");
         newdiv(extra, "results-ur", "UR: " + errortext(hiterrors));
         let starsBlock = newdiv(extra, "results-stars", "★ …");
         let ppBlock = newdiv(extra, "results-pp", "PP …");
         if (this.fullcombo) newdiv(extra, "results-fc", "Full Combo");

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
            window.open("profile-v2.html?u=" + encodeURIComponent(window.localStorage.getItem("username") || ""), "_blank");
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
            // Try to get accurate PP from backend which now uses rosu-pp if _osu available
            const payload = { stars: starsVal != null ? Number(starsVal) : 0, acc: acc * 100, combo: this.maxcombo, maxCombo: this.maxcombo, modsNum: mods, c300: this.judgecnt.great, c100: this.judgecnt.good, c50: this.judgecnt.meh, miss: this.judgecnt.miss };
            // If we have the raw .osu, also send it for server-side rosu calculation (more accurate)
            const rawOsu = window.playback && window.playback.track && window.playback.track.track;
            if (rawOsu && rawOsu.length < 500000) {
               // Use new rosu endpoint if available (POST with osu text)
               fetch("/api/pp/rosu", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ osu: rawOsu, mods, accuracy: acc*100, combo: this.maxcombo, n300: this.judgecnt.great, n100: this.judgecnt.good, n50: this.judgecnt.meh, misses: this.judgecnt.miss }) })
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
            sid: metadata.BeatmapSetID,
            bid: metadata.BeatmapID,
            title: metadata.Title,
            artist: metadata.Artist,
            player: metadata.Player,
            version: metadata.Version,
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
         var isReplay = !!(window.game && window.game.replayMode);
         if (!isReplay) addPlayHistory(summary);
         if (!isReplay) uploadScore(summary);
         if (!isReplay && window.WebosuAPI && WebosuAPI.isLoggedIn()) {
            try {
               WebosuAPI.submitScore({
                  beatmap_id: parseInt(summary.bid, 10) || 0,
                  beatmap_set_id: parseInt(summary.sid, 10) || 0,
                  title: summary.title,
                  artist: summary.artist,
                  version: summary.version,
                  mods: summary.mods,
                  modsNum: modsEnum(window.game),
                  score: parseInt(summary.score, 10) || 0,
                  combo: parseInt(summary.combo, 10) || 0,
                  acc: parseFloat(summary.acc) || 0,
                  grade: summary.grade,
                  count300: summary.count300,
                  count100: summary.count100,
                  count50: summary.count50,
                  miss: summary.misses,
                  replay:
                     (window.playback && window.playback.replayFrames) || null,
                  beatmap: (function () {
                     const t = window.playback && window.playback.track;
                     if (!t || !t.hitObjects) return null;
                     return {
                        od: t.difficulty && t.difficulty.OverallDifficulty,
                        cs: t.difficulty && t.difficulty.CircleSize,
                        hitObjects: t.hitObjects.slice(0, 12000).map(function (h) {
                           return {
                              time: h.time, x: h.x, y: h.y,
                              type: h.type, endTime: h.endTime,
                           };
                        }),
                     };
                  })(),
               });
            } catch (e) {
               console.warn("webosu score submit failed", e);
            }
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
  destroy(options) {
      PIXI.Container.prototype.destroy.call(this, options);
     }
}
export default ScoreOverlay;
