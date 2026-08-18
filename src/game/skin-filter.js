// skin-filter.js — Shared skin filtering logic (no PIXI dependency)
// Used by both skin-loader.js (runtime) and scripts/strip-skin.mjs (build-time)
//
// ── @2x variant handling (T14 D7 — extended to full lazer-legal set) ───────
// The whitelist below matches BASE names only (e.g. hitcircle.png,
// approachcircle.png, sliderb.png). skin-loader.js strips @2x from filenames
// before calling isGameplayTexture, then uses pickBestResolution to prefer
// cursor@2x.png over cursor.png when devicePixelRatio > 1. As a result, any
// base name in the whitelist transparently gets its @2x variant loaded on
// high-DPI displays — no separate whitelist entry is needed.
//
// Beatmap-skin @2x disable (lazer `LegacyBeatmapSkin.AllowHighResolutionSprites
// => false`): webosu does NOT load textures from beatmap skins at all (only
// the user .osk skin provides textures), so the beatmap-skin @2x disable is
// implicitly enforced — no code needed.
//
// If a new skin texture is added below, its @2x variant is picked up
// automatically as long as devicePixelRatio > 1.

export const OSK_NAME_MAP = {
  "hitcircle.png": "disc.png",
  "sliderb0.png": "sliderb.png",
  "sliderb.png": "sliderb.png",
  // Spinner name aliases: modern skins use spinner-background/metre/circle,
  // old skins use spinnerbase/spinnerprogress/spinnertop. Map both ways.
  "spinner-background.png": "spinnerbase.png",
  "spinner-metre.png": "spinnerprogress.png",
  "spinner-circle.png": "spinnertop.png",
  "default-0.png": "0.png", "default-1.png": "1.png", "default-2.png": "2.png",
  "default-3.png": "3.png", "default-4.png": "4.png", "default-5.png": "5.png",
  "default-6.png": "6.png", "default-7.png": "7.png", "default-8.png": "8.png",
  "default-9.png": "9.png",
  "default-x.png": "score-x.png",
  "default-dot.png": "dot.png",
  "default-percent.png": "percent.png",
  "default-comma.png": "default-comma.png",
};

export const OSK_EXTRA_TEXTURES = [
   "hit0.png", "hit50.png", "hit100.png", "hit300.png", "hit300g.png", "hit300k.png", "hit100k.png",
   "cursortrail.png", "cursormiddle.png", "cursor-ripple.png", "star2.png", "cursor-smoke.png",
   "sliderendcircle.png", "sliderendcircleoverlay.png",
   "sliderstartcircle.png", "sliderstartcircleoverlay.png",
   "sliderpoint30.png", "sliderpoint10.png",
   "particle50.png", "particle100.png", "particle300.png",
   "scorebar-ki.png", "scorebar-kidanger.png", "scorebar-kidanger2.png",
   "followpoint-0.png", "followpoint-1.png", "followpoint-2.png",
   "followpoint-3.png", "followpoint-4.png", "followpoint-5.png",
   "followpoint-6.png", "followpoint-7.png", "followpoint-8.png", "followpoint-9.png",
   "scorebar-bg.png", "scorebar-colour.png",
   "ring-glow.png", "hitcircleoverlay.png", "approachcircle.png",
   "sliderscorepoint.png", "sliderfollowcircle.png", "reversearrow.png",
];

export const HITSOUND_NAMES = [
  "normal-hitnormal", "normal-hitwhistle", "normal-hitfinish", "normal-hitclap",
  "normal-slidertick",
  "soft-hitnormal", "soft-hitwhistle", "soft-hitfinish", "soft-hitclap",
  "soft-slidertick",
  "drum-hitnormal", "drum-hitwhistle", "drum-hitfinish", "drum-hitclap",
  "drum-slidertick",
  "combobreak",
];

export function isGameplayTexture(name) {
  const n = name.toLowerCase();
  // Filter out mania and fruits (user requested)
  if (n.includes("mania") || n.includes("fruits") || n.includes("fruit")) return false;
  // Note: inputoverlay is kept for tap indicator (was previously filtered)
  if (n.startsWith("menu-") || n.startsWith("ranking-") || n.startsWith("selection-") || n.startsWith("fail-") || n.startsWith("pause-") || n.startsWith("play-") || n.startsWith("mode-") || n.startsWith("welcome") || n.includes("background") || n.includes("ranking") || n.includes("menu-")) return false;
   if (n.startsWith("inputoverlay")) return true;
   // Hit judgement textures + animation frames (hit0-0.png ... hit0-N.png).
   // T16 implements the AnimatedSprite playback; T03 just whitelists them so
   // they're not rejected at load time.
   if (n.startsWith("hit") && n.match(/^hit(0|50|100|300)[kg]?\.png$/)) return true;
   if (n.startsWith("hit") && n.match(/^hit(0|50|100|300)[kg]?-\d+\.png$/)) return true;
   if (n.match(/^default-[0-9]\.png$/)) return true;
   if (n.match(/^default-(dot|comma|percent|x)\.png$/)) return true;
   if (n.match(/^score-[0-9]\.png$/)) return true;
   if (n.match(/^score-(dot|comma|percent|x)\.png$/)) return true;
   // Particle textures (hit burst particles)
   if (n.match(/^particle(0|50|100|300)\.png$/)) return true;
   // Slider point textures (skin version <2.0)
   if (n.match(/^sliderpoint(10|30)\.png$/)) return true;
   if (n.startsWith("cursor") || n.startsWith("followpoint") || n.startsWith("slider") || n.startsWith("approachcircle") || n.startsWith("hitcircle") || n.startsWith("particle")) {
      // followpoint animation frames: allow full 0-60 range (smooth follow)
      if (n.match(/^followpoint-\d+\.png$/)) {
         const idx = parseInt(n.match(/followpoint-(\d+)\.png/)[1], 10);
         return idx >=0 && idx <=60;
      }
      // sliderb animation frames: allow full 0-60 range (smooth slider body)
      if (n.match(/^sliderb\d+\.png$/)) {
         const idx = parseInt(n.match(/sliderb(\d+)\.png/)[1], 10);
         return idx >=0 && idx <=60;
      }
      return true;
   }
   if (["disc.png","hitcircleoverlay.png","ring-glow.png","hitburst.png","followpoint.png","approachcircle.png","sliderb.png","sliderfollowcircle.png","reversearrow.png","sliderscorepoint.png","sliderendcircle.png","sliderendcircleoverlay.png","sliderstartcircle.png","sliderstartcircleoverlay.png","sliderpoint30.png","sliderpoint10.png","cursortrail.png","cursormiddle.png","cursor.png","cursor-ripple.png","star2.png","cursor-smoke.png","particle0.png","particle50.png","particle100.png","particle300.png","dot.png","percent.png","score-x.png","score-dot.png","score-percent.png","0.png","1.png","2.png","3.png","4.png","5.png","6.png","7.png","8.png","9.png","hit0.png","hit50.png","hit100.png","hit300.png","hit300g.png","hit300k.png","hit100k.png","scorebar-bg.png","scorebar-colour.png","scorebar-ki.png","scorebar-kidanger.png","scorebar-kidanger2.png","errormeterbar.png","errormeterindicator.png","spinnerbase.png","spinnerprogress.png","spinnertop.png","spinner-background.png","spinner-metre.png","spinner-circle.png","spinner-approachcircle.png","spinner-warning.png","spinner-clear.png","spinner-rpm.png","bar.png","barend.png"].includes(n)) return true;
  if (OSK_EXTRA_TEXTURES.includes(name) || OSK_NAME_MAP[name]) return true;
  if (n.match(/^(numbers|combos)-[0-9]\.png$/)) return true;
  if (n.match(/^(numbers|combos)-(dot|comma|percent|x)\.png$/)) return true;
  return false;
}

export function isGameplaySound(name) {
  const base = name.replace(/\.(wav|ogg|mp3)$/i, "");
  return HITSOUND_NAMES.includes(base);
}
