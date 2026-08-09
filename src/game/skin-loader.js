// skin-loader.js — Unified .osk skin file loading for webosu
// Extracts a .osk (renamed .zip) and applies all elements:
// textures (PNG → PIXI.Texture), hitsounds (WAV/OGG → Howler), and skin.ini config.
// Uses blob URLs for efficient texture loading and IndexedDB for caching.

import { unzipSync } from "fflate";
import { log as clog, warn as cwarn } from "./logger.js";

// ── Name mapping: osu! skin filename → webosu spritesheet key ──
// Most osu! skin names already match webosu keys; only these need translation.
const OSK_NAME_MAP = {
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
  "default-comma.png": "default-comma.png", // not in default spritesheet; added dynamically
};

// Textures that exist in .osk skins but NOT in the default webosu spritesheet.
// These are loaded as new PIXI textures and added to window.Skin dynamically.
const OSK_EXTRA_TEXTURES = [
  "hit0.png", "hit50.png", "hit100.png", "hit300.png", "hit300g.png",
  "hit300k.png", "hit100k.png", "hit50k.png",
  "cursortrail.png", "cursormiddle.png", "cursor-smoke.png",
  "sliderendcircle.png", "sliderendcircleoverlay.png",
  "followpoint-0.png", "followpoint-1.png", "followpoint-2.png",
  "followpoint-3.png", "followpoint-4.png", "followpoint-5.png",
  "followpoint-6.png", "followpoint-7.png", "followpoint-8.png", "followpoint-9.png",
  "comboburst.png", "lighting.png", "playfield.png", "star.png",
  "scorebar-bg.png", "scorebar-colour.png", "scorebar-ki.png", "scorebar-kidanger.png", "scorebar-kidanger2.png",
  "spinner-approachcircle.png", "spinner-background.png", "spinner-clear.png", "spinner-warning.png", "spinner-glow.png", "spinner-rpm.png",
  "ring-glow.png", "hitcircleoverlay.png", "approachcircle.png",
  "sliderscorepoint.png", "sliderfollowcircle.png", "reversearrow.png",
  // alphabet for score/default prefixes — loaded generically but listed for @2x detection
  "score-a.png", "score-b.png", "score-c.png", "score-d.png", "score-e.png", "score-f.png", "score-g.png", "score-h.png", "score-i.png", "score-j.png", "score-k.png", "score-l.png", "score-m.png", "score-n.png", "score-o.png", "score-p.png", "score-q.png", "score-r.png", "score-s.png", "score-t.png", "score-u.png", "score-v.png", "score-w.png", "score-x.png", "score-y.png", "score-z.png",
  "score-comma.png", "score-dot.png", "score-percent.png",
  "a.png", "b.png", "c.png", "d.png", "e.png", "f.png", "g.png", "h.png", "i.png", "j.png", "k.png", "l.png", "m.png", "n.png", "o.png", "p.png", "q.png", "r.png", "s.png", "t.png", "u.png", "v.png", "w.png", "x.png", "y.png", "z.png",
  "comma.png", "dot.png", "percent.png",
];

// Hitsound canonical names (without extension) → game.sample mapping
const HITSOUND_NAMES = [
  "normal-hitnormal", "normal-hitwhistle", "normal-hitfinish", "normal-hitclap",
  "normal-slidertick", "normal-sliderslide", "normal-sliderwhistle",
  "soft-hitnormal", "soft-hitwhistle", "soft-hitfinish", "soft-hitclap",
  "soft-slidertick", "soft-sliderslide", "soft-sliderwhistle",
  "drum-hitnormal", "drum-hitwhistle", "drum-hitfinish", "drum-hitclap",
  "drum-slidertick", "drum-sliderslide", "drum-sliderwhistle",
  "combobreak",
];

// ── skin.ini parser ──
export function parseSkinIni(iniText) {
  const config = {
    cursorSize: null,
    cursorRotate: false,
    cursorExpand: true,
    cursorCentre: true,
    sliderStyle: 2,
    sliderBallFrames: 0,
    allowSliderBallTint: false,
    comboColors: [],
    sliderBorder: null,
    sliderTrackOverride: null,
    approachCircle: null,
    hitCirclePrefix: "default",
    hitCircleOverlap: 0,
    scorePrefix: "score",
    scoreOverlap: 0,
    name: "",
    author: "",
    version: "latest",
  };

  const lines = iniText.split("\n");
  let section = "";
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith("//")) continue;
    if (line.startsWith("[") && line.endsWith("]")) {
      section = line.slice(1, -1).toLowerCase();
      continue;
    }
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();

    if (section === "general") {
      if (key === "Name") config.name = val;
      else if (key === "Author") config.author = val;
      else if (key === "Version") config.version = val;
      else if (key === "CursorSize") config.cursorSize = parseFloat(val);
      else if (key === "CursorRotate") config.cursorRotate = val === "1";
      else if (key === "CursorExpand") config.cursorExpand = val === "1";
      else if (key === "CursorCentre") config.cursorCentre = val === "1";
      else if (key === "SliderStyle") config.sliderStyle = parseInt(val) || 2;
      else if (key === "SliderBallFrames") config.sliderBallFrames = parseInt(val) || 0;
      else if (key === "AllowSliderBallTint") config.allowSliderBallTint = val === "1";
    } else if (section === "colours") {
      if (key.startsWith("Combo")) {
        const rgb = val.split(",").map(v => parseInt(v.trim()) || 0);
        if (rgb.length >= 3) config.comboColors.push((rgb[0] << 16) | (rgb[1] << 8) | rgb[2]);
      } else if (key === "SliderBorder") {
        const rgb = val.split(",").map(v => parseInt(v.trim()) || 0);
        config.sliderBorder = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
      } else if (key === "SliderTrackOverride") {
        const rgb = val.split(",").map(v => parseInt(v.trim()) || 0);
        config.sliderTrackOverride = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
      } else if (key === "ApproachCircle") {
        const rgb = val.split(",").map(v => parseInt(v.trim()) || 0);
        config.approachCircle = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
      }
    } else if (section === "fonts") {
      if (key === "HitCirclePrefix") config.hitCirclePrefix = val;
      else if (key === "HitCircleOverlap") config.hitCircleOverlap = parseInt(val) || 0;
      else if (key === "ScorePrefix") config.scorePrefix = val;
      else if (key === "ScoreOverlap") config.scoreOverlap = parseInt(val) || 0;
    }
  }
  return config;
}

// ── Resolve osu! filename to webosu key ──
function resolveTextureName(osuName) {
  // Check direct mapping first
  if (OSK_NAME_MAP[osuName]) return OSK_NAME_MAP[osuName];
  // Generic default-* mapping for alphabet/symbols: default-a.png -> a.png, etc
  if (osuName.startsWith("default-") && osuName.endsWith(".png")) {
    const base = osuName.slice(8); // strip "default-"
    // digits and x/dot/percent already handled above, but handle generic letters
    if (/^[a-z]-/.test(base) || /^[a-z]\.png$/.test(base) || /^[0-9]\.png$/.test(base) || base === "comma.png" || base === "dot.png" || base === "percent.png" || base === "x.png") {
      // keep x/dot/percent as per map above for consistency, but for letters use a.png
      if (OSK_NAME_MAP[osuName]) return OSK_NAME_MAP[osuName];
      return base;
    }
    // fallback: store both original and stripped
    return base;
  }
  // Check if it's an extra texture (not in default spritesheet)
  if (OSK_EXTRA_TEXTURES.includes(osuName)) return osuName;
  // Score prefix alphabet etc — keep as is (score-a.png etc)
  if (osuName.startsWith("score-") && osuName.endsWith(".png")) return osuName;
  // Check if the name matches a default spritesheet key directly
  // (approachcircle.png, cursor.png, followpoint.png, etc.)
  return osuName;
}

// ── Pick @2x variant if available and devicePixelRatio > 1 ──
function pickBestResolution(files, name) {
  const dpr = window.devicePixelRatio || 1;
  if (dpr > 1) {
    const at2x = name.replace(".png", "@2x.png");
    if (files[at2x]) return at2x;
  }
  return name;
}

// ── Extract and load a .osk file ──
export async function loadOsk(file) {
  const ab = await file.arrayBuffer();
  const extracted = unzipSync(new Uint8Array(ab));
  const files = {};
  for (const path in extracted) {
    files[path.toLowerCase()] = extracted[path];
  }

  // Parse skin.ini
  let config = null;
  if (files["skin.ini"]) {
    config = parseSkinIni(new TextDecoder().decode(files["skin.ini"]));
  }

  // Load textures
  const textures = {};
  const usedFiles = new Set();
  for (const name in files) {
    if (!name.endsWith(".png")) continue;
    // Skip @2x variants at the top level — they're picked per-texture
    if (name.includes("@2x")) continue;

    const resolvedName = resolveTextureName(name);
    if (!resolvedName) continue;

    // Pick best resolution
    const bestName = pickBestResolution(files, name);
    const buf = files[bestName] || files[name];
    if (!buf) continue;

    // Create blob URL
    const blob = new Blob([buf], { type: "image/png" });
    const url = URL.createObjectURL(blob);
    textures[resolvedName] = { url, buffer: buf };
    usedFiles.add(bestName);
    usedFiles.add(name);
  }

  // Load hitsounds
  const sounds = {};
  for (const name in files) {
    const base = name.replace(/\.(wav|ogg|mp3)$/i, "");
    const ext = name.split(".").pop().toLowerCase();
    if (!HITSOUND_NAMES.includes(base)) continue;
    if (!["wav", "ogg", "mp3"].includes(ext)) continue;

    const buf = files[name];
    const mime = ext === "wav" ? "audio/wav" : ext === "ogg" ? "audio/ogg" : "audio/mpeg";
    const blob = new Blob([buf], { type: mime });
    sounds[base] = { url: URL.createObjectURL(blob), buffer: buf };
  }

  return { textures, sounds, config, rawFiles: files };
}

// ── Apply skin to the game ──
export function applySkin(skinData) {
  if (!skinData) return;

  // Apply textures to window.Skin — use Image element to avoid PIXI Assets cache warning for blob URLs
  if (skinData.textures && window.Skin) {
    clog("skin-loader", "applying", Object.keys(skinData.textures).length, "textures");
    for (const key in skinData.textures) {
      try {
        const url = skinData.textures[key].url;
        const img = new Image();
        img.src = url;
        const tex = PIXI.Texture.from(img);
        const finalTex = tex.baseTexture ? tex : PIXI.Texture.from(url);
        window.Skin[key] = finalTex;
        // also add to Assets cache to silence "[Assets] Asset id blob: was not found" warning if later code uses Assets.get
        try { if (PIXI.Assets && PIXI.Assets.cache) PIXI.Assets.cache.set(url, finalTex); } catch (_) {}
        clog("skin-loader", "applied texture", key, url.slice(0, 40));
      } catch (e) {
        cwarn("skin-loader", "texture apply failed:", key, e);
        try { const t2 = PIXI.Texture.from(skinData.textures[key].url); window.Skin[key] = t2; try { PIXI.Assets.cache.set(skinData.textures[key].url, t2); } catch(_){} } catch (_) {}
      }
    }
  }

  // Apply hitsounds to game.sample
  if (skinData.sounds && window.game) {
    const sampleMap = {
      "normal-hitnormal": [1, "hitnormal"], "normal-hitwhistle": [1, "hitwhistle"],
      "normal-hitfinish": [1, "hitfinish"], "normal-hitclap": [1, "hitclap"],
      "normal-slidertick": [1, "slidertick"], "normal-sliderslide": [1, "sliderslide"],
      "normal-sliderwhistle": [1, "sliderwhistle"],
      "soft-hitnormal": [2, "hitnormal"], "soft-hitwhistle": [2, "hitwhistle"],
      "soft-hitfinish": [2, "hitfinish"], "soft-hitclap": [2, "hitclap"],
      "soft-slidertick": [2, "slidertick"], "soft-sliderslide": [2, "sliderslide"],
      "soft-sliderwhistle": [2, "sliderwhistle"],
      "drum-hitnormal": [3, "hitnormal"], "drum-hitwhistle": [3, "hitwhistle"],
      "drum-hitfinish": [3, "hitfinish"], "drum-hitclap": [3, "hitclap"],
      "drum-slidertick": [3, "slidertick"], "drum-sliderslide": [3, "sliderslide"],
      "drum-sliderwhistle": [3, "sliderwhistle"],
    };
    for (const name in skinData.sounds) {
      const mapping = sampleMap[name];
      if (mapping && window.game.sample && window.game.sample[mapping[0]]) {
        // Load the sound via Howler
        const snd = new Howl({ src: [skinData.sounds[name].url], preload: true });
        window.game.sample[mapping[0]][mapping[1]] = snd;
      }
    }
    // combobreak is special
    if (skinData.sounds["combobreak"] && window.game.sample) {
      const snd = new Howl({ src: [skinData.sounds["combobreak"].url], preload: true });
      if (window.game.sample.combo) window.game.sample.combo = snd;
    }
  }

  // Apply skin.ini config to game
  if (skinData.config && window.game) {
    const c = skinData.config;
    if (c.cursorSize != null) window.game.skinCursorSize = c.cursorSize;
    window.game.skinCursorRotate = c.cursorRotate;
    window.game.skinCursorExpand = c.cursorExpand;
    window.game.skinComboColors = c.comboColors.length > 0 ? c.comboColors : null;
    window.game.skinSliderBorder = c.sliderBorder;
    window.game.skinSliderTrackOverride = c.sliderTrackOverride;
    window.game.skinConfig = c;
    window.game.allowSliderBallTint = !!c.allowSliderBallTint;
  }
}

// ── Cache skin in IndexedDB ──
const DB_NAME = "webosu-skins";
const STORE_NAME = "skinFiles";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function cacheSkin(skinData) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    // Store config
    store.put(JSON.stringify(skinData.config || {}), "config");

    // Store texture buffers
    const texBuffers = {};
    for (const key in skinData.textures) {
      texBuffers[key] = skinData.textures[key].buffer;
    }
    store.put(texBuffers, "textures");

    // Store sound buffers
    const sndBuffers = {};
    for (const key in skinData.sounds) {
      sndBuffers[key] = skinData.sounds[key].buffer;
    }
    store.put(sndBuffers, "sounds");

    return new Promise((resolve) => {
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
    });
  } catch (e) {
    console.warn("skin cache failed:", e);
  }
}

export async function loadCachedSkin() {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const results = {};

      const getConfig = store.get("config");
      const getTextures = store.get("textures");
      const getSounds = store.get("sounds");

      getConfig.onsuccess = () => {
        results.config = getConfig.result ? JSON.parse(getConfig.result) : null;
      };
      getTextures.onsuccess = () => {
        results.rawTextures = getTextures.result || {};
      };
      getSounds.onsuccess = () => {
        results.rawSounds = getSounds.result || {};
      };

      tx.oncomplete = () => {
        db.close();
        if (!results.rawTextures && !results.rawSounds) {
          resolve(null);
          return;
        }
        // Recreate blob URLs from cached buffers
        const textures = {};
        for (const key in results.rawTextures) {
          const buf = results.rawTextures[key];
          const blob = new Blob([buf], { type: "image/png" });
          textures[key] = { url: URL.createObjectURL(blob), buffer: buf };
        }
        const sounds = {};
        for (const key in results.rawSounds) {
          const buf = results.rawSounds[key];
          const ext = key.includes("combobreak") ? "wav" : "wav";
          const blob = new Blob([buf], { type: "audio/wav" });
          sounds[key] = { url: URL.createObjectURL(blob), buffer: buf };
        }
        resolve({ textures, sounds, config: results.config });
      };
      tx.onerror = () => { db.close(); resolve(null); };
    });
  } catch (e) {
    return null;
  }
}

export async function clearCachedSkin() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
    return new Promise((resolve) => {
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
    });
  } catch (e) {
    console.warn("skin clear failed:", e);
  }
}
