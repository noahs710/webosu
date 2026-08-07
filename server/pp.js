"use strict";

// Simplified, additive-only osu!standard PP estimator. This is NOT the official
// algorithm; it is a rough approximation for a webosu-specific value shown next
// to scores. catboy.best remains the source of truth for beatmap data.

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
    c300 = 0, c100 = 0, c50 = 0, miss = 0,
  } = input || {};
  const a = acc == null ? accuracyFromCounts(c300, c100, c50, miss) : Math.min(1, Math.max(0, acc));

  let mult = 1;
  if (modsNum & 2) mult *= 0.5;   // EZ
  if (modsNum & 8) mult *= 1.12;   // HD
  if (modsNum & 16) mult *= 1.06;  // HR
  if (modsNum & 64) mult *= 1.12;  // DT/NC
  if (modsNum & 256) mult *= 0.9;  // HT/DC
  if (modsNum & 1) mult *= 0.5;    // NF

  const s = Math.max(0, stars);
  const aim = Math.pow(1.06 * s, 2.2);
  const comboFactor = 1 + Math.min(combo, maxCombo || combo) / 4000;
  const accFactor = Math.pow(a, 8) * 0.5 + 0.5;
  return Math.round(aim * accFactor * comboFactor * mult);
}

module.exports = { estimatePP, accuracyFromCounts };
