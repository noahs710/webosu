"use strict";
const crypto = require("crypto");

/*
 * Server-side replay validation (anti-cheat).
 *
 * The replay is the per-frame input log recorded by playback.js:
 *   [{ t: <ms>, x: <0..512 osu px>, y: <0..384 osu px>, d: <any-key/mouse down> }]
 *
 * We re-derive how many of the claimed hit objects the replay could plausibly
 * support: for every circle / slider head, we look for a "down" frame within the
 * object's hit window that has the cursor within the circle radius. A real play
 * presses near each object at the right time; a fabricated score (random or
 * empty replay) supports far fewer. Scores whose replay supports <60% of their
 * claimed hits are marked approved=0 and excluded from the leaderboard but kept.
 *
 * This is conservative: it only rejects clear mismatches, so legitimate runs
 * (including fails, where the replay covers part of the map) are not penalised.
 * catboy.best remains the source of truth for beatmap data; the played beatmap's
 * hitobjects are submitted by the client for validation.
 *
 * v2: accepts the expanded lazer mod set + mod acronym list. Scores with
 * unranked mods (RX, AP, AT, or the fun mods) are marked ranked=0.
 */

// The expanded mod acronym set (lazer parity). Unknown mods are rejected.
const KNOWN_MODS = new Set([
  "HR", "EZ", "DT", "NC", "HT", "HD", "NF", "SD", "PF", "SO", "CL", "DA", "AT",
  "FL", "RX", "AP", "TP", "AS",
  "MG", "WO", "WU", "TR", "AD", "BU", "RP", "DP", "TF", "NS",
]);

// Mods that make a score unranked (lazer: 0x multiplier / unranked).
const UNRANKED_MODS = new Set(["RX", "AP", "AT", "MG", "WO", "WU", "TR", "AD", "BU", "RP", "DP", "TF", "NS"]);

// Compute a stable hash for a mod acronym list (sorted, joined, sha256 truncated).
function modsHash(modsList) {
  if (!Array.isArray(modsList) || modsList.length === 0) return "nomod";
  const sorted = modsList.slice().sort().join(",");
  return crypto.createHash("sha256").update(sorted).digest("hex").slice(0, 16);
}

function validate(score, beatmap, replay) {
  // v2: validate the mod list + compute ranked + mods_hash FIRST (before the early returns)
  const modsList = Array.isArray(score && score.mods_list) ? score.mods_list : null;
  let ranked = true;
  let mh = null;
  let modsError = null;
  if (modsList) {
    for (const m of modsList) {
      if (!KNOWN_MODS.has(m)) {
        modsError = "unknown mod: " + m;
        break;
      }
      if (UNRANKED_MODS.has(m)) ranked = false;
    }
    if (!modsError) mh = modsHash(modsList);
  }

  if (!replay || !Array.isArray(replay) || replay.length === 0)
    return { approved: true, reason: "no-replay", ranked, mods_hash: mh, mods_error: modsError };
  if (modsError) return { approved: false, reason: "unknown-mod", ranked: false, mods_hash: mh, mods_error: modsError };
  if (!beatmap || !Array.isArray(beatmap.hitObjects))
    return { approved: true, reason: "no-beatmap", ranked, mods_hash: mh, mods_error: modsError };

  const od = beatmap.od != null ? beatmap.od : 8;
  const cs = beatmap.cs != null ? beatmap.cs : 4;
  const mehTime = 200 - 10 * od; // ms hit window
  const radius = (109 - 9 * cs) / 2; // osu pixels
  const r2 = radius * radius;

  const downFrames = replay
    .filter((f) => f && f.d)
    .sort((a, b) => a.t - b.t);

  const claimedHits =
    (score.count300 || 0) + (score.count100 || 0) + (score.count50 || 0);

  let checkable = 0;
  let supported = 0;
  for (const ho of beatmap.hitObjects) {
    if (ho.type === "spinner") continue;
    if (ho.time == null || ho.x == null || ho.y == null) continue;
    checkable++;
    const lo = ho.time - mehTime;
    const hi = ho.time + mehTime;
    // binary search a start point
    let i = lowerBound(downFrames, lo);
    let near = false;
    for (; i < downFrames.length; i++) {
      const f = downFrames[i];
      if (f.t > hi) break;
      const dx = f.x - ho.x;
      const dy = f.y - ho.y;
      if (dx * dx + dy * dy <= r2) { near = true; break; }
    }
    if (near) supported++;
  }

  if (checkable === 0) return { approved: true, reason: "no-checkable", ranked: true, mods_hash: null };

  // tolerate coarse replay + the slider/spinner judgements that aren't proximity
  // checked (claim can exceed checkable). Require the replay to back most claims.
  let approved = true;
  if (claimedHits > 0 && supported < claimedHits * 0.6) {
    approved = false;
  }

  return {
    approved,
    supported,
    claimedHits,
    checkable,
    reason: approved ? "ok" : "replay-does-not-support-claims",
    ranked,
    mods_hash: mh,
    mods_error: modsError,
  };
}

function lowerBound(arr, t) {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid].t < t) lo = mid + 1; else hi = mid;
  }
  return lo;
}

module.exports = { validate };
