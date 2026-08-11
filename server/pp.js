"use strict";

// PP estimator — tries rosu-pp-js (accurate) first, falls back to simple formula.
let rosu = null;
try { rosu = require("rosu-pp-js"); } catch (e) { rosu = null; }

function accuracyFromCounts(c300, c100, c50, miss) {
  const total = (c300 || 0) + (c100 || 0) + (c50 || 0) + (miss || 0);
  if (!total) return 1;
  return ((c300 || 0) * 300 + (c100 || 0) * 100 + (c50 || 0) * 50) / (total * 300);
}

function estimatePP(input) {
  const {
    stars = 0,
    acc, // 0..1; if omitted, computed from counts
    combo = 0,
    maxCombo = 0,
    modsNum = 0,
    modsList,
    c300 = 0, c100 = 0, c50 = 0, miss = 0,
  } = input || {};
  const a = acc == null ? accuracyFromCounts(c300, c100, c50, miss) : Math.min(1, Math.max(0, acc));

  let mult = 1;
  // Legacy bitmask mods (stable-era)
  if (modsNum & 2) mult *= 0.5;   // EZ
  if (modsNum & 8) mult *= 1.12;  // HD
  if (modsNum & 16) mult *= 1.06; // HR
  if (modsNum & 64) mult *= 1.12; // DT/NC
  if (modsNum & 256) mult *= 0.9; // HT/DC
  if (modsNum & 1) mult *= 0.5;   // NF
  // v2 mod list: apply approximate multipliers for new lazer mods
  if (Array.isArray(modsList)) {
    for (const m of modsList) {
      // skip legacy mods already handled by bitmask (HR, HD, DT, NC, HT, EZ, NF)
      if (["HR","HD","DT","NC","HT","EZ","NF","SO","SD","PF","CL","DA"].includes(m)) continue;
      if (m === "FL") mult *= 1.12;      // Flashlight
      if (m === "TP") mult *= 1.0;       // Target Practice
      if (m === "AS") mult *= 1.0;       // Adaptive Speed
      // unranked mods (RX, AP, AT, fun mods) → 0x — the score is unranked anyway
      if (["RX","AP","AT","MG","WO","WU","TR","AD","BU","RP","DP","TF","NS"].includes(m)) mult *= 0.0;
    }
  }

  const s = Math.max(0, stars);
  const aim = Math.pow(1.06 * s, 2.2);
  const comboFactor = 1 + Math.min(combo, maxCombo || combo) / 4000;
  const accFactor = Math.pow(a, 8) * 0.5 + 0.5;
  return Math.round(aim * accFactor * comboFactor * mult);
}

// Accurate PP via rosu-pp-js when osu text is available.
// v2: uses lazer:true mode (lazer difficulty/performance model) + the full mod set.
function calcRosuPP(osuText, opts = {}) {
  if (!rosu || !osuText) return null;
  try {
    const map = new rosu.Beatmap(osuText);
    if (map.isSuspicious()) { map.free(); return null; }
    // v2: lazer mode + full mod set. The mod bitmask covers legacy mods;
    // the mod string (opts.modsList) covers new lazer mods rosu supports.
    const mods = opts.mods != null ? opts.mods : (opts.modsNum || 0);
    const useLazer = opts.lazer !== false;  // default true (v2)
    const diffOpts = { mods, lazer: useLazer };
    // if a mod acronym list is provided, pass it as the mods string (rosu-pp supports "HD HR DT")
    if (Array.isArray(opts.modsList) && opts.modsList.length) {
      // rosu-pp-js accepts mods as a string of space-separated acronyms in newer versions
      diffOpts.mods = opts.modsList.join(" ");
    }
    const diff = new rosu.Difficulty(diffOpts);
    const diffAttrs = diff.calculate(map);
    const perfOpts = {
      mods,
      accuracy: opts.accuracy != null ? opts.accuracy : (opts.acc != null ? opts.acc*100 : undefined),
      combo: opts.combo,
      n300: opts.n300, n100: opts.n100, n50: opts.n50, misses: opts.misses,
      nGeki: opts.nGeki, nKatu: opts.nKatu,
    };
    if (Array.isArray(opts.modsList) && opts.modsList.length) perfOpts.mods = opts.modsList.join(" ");
    const perf = new rosu.Performance(perfOpts);
    const perfAttrs = perf.calculate(diffAttrs);
    const result = { pp: perfAttrs.pp, stars: diffAttrs.stars, maxPP: null };
    // also calculate max PP (SS)
    try {
      const maxPerfOpts = { mods, lazer: useLazer };
      if (Array.isArray(opts.modsList) && opts.modsList.length) maxPerfOpts.mods = opts.modsList.join(" ");
      const maxPerf = new rosu.Performance(maxPerfOpts);
      const maxAttrs = maxPerf.calculate(diffAttrs);
      result.maxPP = maxAttrs.pp;
    } catch {}
    map.free(); diff.free(); perf.free();
    if (diffAttrs.free) diffAttrs.free();
    if (perfAttrs.free) perfAttrs.free();
    return result;
  } catch (e) {
    // console.warn("[pp] rosu calc failed", e.message);
    return null;
  }
}

module.exports = { estimatePP, accuracyFromCounts, calcRosuPP, _rosu: rosu };
