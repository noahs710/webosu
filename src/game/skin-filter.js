// skin-filter.js — Shared skin filtering logic (no PIXI dependency)
// Used by both skin-loader.js (runtime) and scripts/strip-skin.mjs (build-time)

export const OSK_NAME_MAP = {
  "hitcircle.png": "disc.png",
  "sliderb0.png": "sliderb.png",
  "sliderb.png": "sliderb.png",
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
   "hit0.png", "hit50.png", "hit100.png", "hit300.png", "hit300g.png",
   "cursortrail.png", "cursormiddle.png",
   "sliderendcircle.png", "sliderendcircleoverlay.png",
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
  if (n.startsWith("menu-") || n.startsWith("ranking-") || n.startsWith("selection-") || n.startsWith("fail-") || n.startsWith("pause-") || n.startsWith("play-") || n.startsWith("mode-") || n.startsWith("welcome") || n.startsWith("inputoverlay") || n.includes("background") || n.includes("ranking") || n.includes("menu-")) return false;
  if (n.startsWith("hit") && n.match(/^hit(0|50|100|300)[k]?\.png$/)) return true;
  if (n.match(/^default-[0-9]\.png$/)) return true;
  if (n.match(/^default-(dot|comma|percent|x)\.png$/)) return true;
  if (n.match(/^score-[0-9]\.png$/)) return true;
  if (n.match(/^score-(dot|comma|percent|x)\.png$/)) return true;
  if (n.startsWith("cursor") || n.startsWith("followpoint") || n.startsWith("slider") || n.startsWith("approachcircle") || n.startsWith("hitcircle")) {
     if (n.match(/^followpoint-\d+\.png$/)) {
        const idx = parseInt(n.match(/followpoint-(\d+)\.png/)[1], 10);
        return idx >=0 && idx <=9;
     }
     if (n.match(/^sliderb\d*\.png$/)) return true;
     return true;
  }
  if (["disc.png","hitcircleoverlay.png","ring-glow.png","hitburst.png","followpoint.png","approachcircle.png","sliderb.png","sliderfollowcircle.png","reversearrow.png","sliderscorepoint.png","sliderendcircle.png","sliderendcircleoverlay.png","cursortrail.png","cursormiddle.png","cursor.png","dot.png","percent.png","score-x.png","score-dot.png","score-percent.png","0.png","1.png","2.png","3.png","4.png","5.png","6.png","7.png","8.png","9.png","hit0.png","hit50.png","hit100.png","hit300.png","hit300g.png","scorebar-bg.png","scorebar-colour.png","errormeterbar.png","errormeterindicator.png","spinnerbase.png","spinnerprogress.png","spinnertop.png","bar.png","barend.png"].includes(n)) return true;
  if (OSK_EXTRA_TEXTURES.includes(name) || OSK_NAME_MAP[name]) return true;
  if (n.match(/^(numbers|combos)-[0-9]\.png$/)) return true;
  if (n.match(/^(numbers|combos)-(dot|comma|percent|x)\.png$/)) return true;
  return false;
}

export function isGameplaySound(name) {
  const base = name.replace(/\.(wav|ogg|mp3)$/i, "");
  return HITSOUND_NAMES.includes(base);
}