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
// Keep this list minimal for gameplay — alphabet is handled generically on demand, not prelisted.
const OSK_EXTRA_TEXTURES = [
  "hit0.png", "hit50.png", "hit100.png", "hit300.png", "hit300g.png",
  "hit300k.png", "hit100k.png", "hit50k.png",
  "cursortrail.png", "cursormiddle.png", "cursor-smoke.png",
  "sliderendcircle.png", "sliderendcircleoverlay.png",
  "followpoint-0.png", "followpoint-1.png", "followpoint-2.png",
  "followpoint-3.png", "followpoint-4.png", "followpoint-5.png",
  "followpoint-6.png", "followpoint-7.png", "followpoint-8.png", "followpoint-9.png",
  "comboburst.png", "lighting.png", "playfield.png", "star.png", "star2.png",
  "scorebar-bg.png", "scorebar-colour.png", "scorebar-ki.png", "scorebar-kidanger.png", "scorebar-kidanger2.png",
  "spinner-approachcircle.png", "spinner-background.png", "spinner-clear.png", "spinner-warning.png", "spinner-glow.png", "spinner-rpm.png",
  "ring-glow.png", "hitcircleoverlay.png", "approachcircle.png",
  "sliderscorepoint.png", "sliderfollowcircle.png", "reversearrow.png",
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

// ── Gameplay-relevant texture filter — prevents OUT_OF_MEMORY from loading 800+ menu/ranking images
function isGameplayTexture(name) {
  const n = name.toLowerCase();
  // block menu/ranking/selection/fail/pause etc. immediately (huge, not gameplay)
  if (n.startsWith("menu-") || n.startsWith("ranking-") || n.startsWith("selection-") || n.startsWith("fail-") || n.startsWith("pause-") || n.startsWith("play-") || n.startsWith("mode-") || n.startsWith("welcome") || n.startsWith("inputoverlay") || n.includes("background") || n.includes("ranking") || n.includes("menu-")) return false;
  // whitelist: only gameplay essentials
  if (n.startsWith("hit") && n.match(/^hit(0|50|100|300)[k]?\.png$/)) return true; // only base hit judgements, not hit0-0.png variants
  if (n.match(/^default-[0-9]\.png$/)) return true;
  if (n.match(/^default-(dot|comma|percent|x)\.png$/)) return true;
  if (n.match(/^score-[0-9]\.png$/)) return true;
  if (n.match(/^score-(dot|comma|percent|x)\.png$/)) return true;
  if (n.startsWith("cursor") || n.startsWith("followpoint") || n.startsWith("slider") || n.startsWith("approachcircle") || n.startsWith("hitcircle")) {
     // for followpoint, only 0-9
     if (n.match(/^followpoint-\d+\.png$/)) {
        const idx = parseInt(n.match(/followpoint-(\d+)\.png/)[1], 10);
        return idx >=0 && idx <=9;
     }
     // for sliderb, only base and 0
     if (n.match(/^sliderb\d*\.png$/)) return true;
     return true;
  }
  if (["disc.png","hitcircleoverlay.png","ring-glow.png","hitburst.png","followpoint.png","approachcircle.png","sliderb.png","sliderfollowcircle.png","reversearrow.png","sliderscorepoint.png","sliderendcircle.png","sliderendcircleoverlay.png","cursortrail.png","cursormiddle.png","cursor.png","cursor-smoke.png","dot.png","percent.png","score-x.png","score-dot.png","score-percent.png","0.png","1.png","2.png","3.png","4.png","5.png","6.png","7.png","8.png","9.png","hit0.png","hit50.png","hit100.png","hit300.png","hit300g.png","scorebar-bg.png","scorebar-colour.png","errormeterbar.png","errormeterindicator.png","spinnerbase.png","spinnerprogress.png","spinnertop.png","bar.png","barend.png","comboburst.png","lighting.png","star.png","star2.png","playfield.png"].includes(n)) return true;
  if (OSK_EXTRA_TEXTURES.includes(name) || OSK_NAME_MAP[name]) return true;
  // numbers/combos prefixes for WhiteCat — only digits, not letters (letters not needed for gameplay numbers)
  if (n.match(/^(numbers|combos)-[0-9]\.png$/)) return true;
  if (n.match(/^(numbers|combos)-(dot|comma|percent|x)\.png$/)) return true;
  // default: block everything else (including score-a-z, ranking, etc.)
  return false;
}

// ── Extract and load a .osk file ──
export async function loadOsk(file) {
  if (file.size > 80 * 1024 * 1024) throw new Error("osk too large (80MB limit)");
  const ab = await file.arrayBuffer();
  if (ab.byteLength > 80 * 1024 * 1024) throw new Error("osk too large (80MB limit)");
  const extracted = unzipSync(new Uint8Array(ab));
  const entryCount = Object.keys(extracted).length;
  if (entryCount > 1000) clog("skin-loader", "many files", entryCount, "capping to gameplay 60");
  let tot = 0; for (const k in extracted) tot += extracted[k].length;
  if (tot > 300 * 1024 * 1024) throw new Error("osk unzipped too large (300MB limit)");
  if (tot > 200 * 1024 * 1024) clog("skin-loader", "large unzipped", (tot/1024/1024).toFixed(1)+"MB", "capping");
  const files = {};
  for (const path in extracted) {
    files[path.toLowerCase()] = extracted[path];
  }

  // Parse skin.ini
  let config = null;
  if (files["skin.ini"]) {
    config = parseSkinIni(new TextDecoder().decode(files["skin.ini"]));
  }

   // Load textures — only gameplay-relevant, capped to avoid OUT_OF_MEMORY (WhiteCat has 806)
   const textures = {};
   const usedFiles = new Set();
   let loadedCount = 0;
   const getMaxTextures = () => {
      try {
         const lowMem = typeof navigator !== 'undefined' && navigator.deviceMemory && navigator.deviceMemory <= 4;
         const lowCpu = typeof navigator !== 'undefined' && navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4;
         const highDpr = (typeof window !== 'undefined' && window.devicePixelRatio > 2);
         if (lowMem || lowCpu || highDpr) return 40;
      } catch {}
      return 60;
   };
   const MAX_TEXTURES = getMaxTextures(); // 60 desktop, 40 low-end (deviceMemory<=4 / hwConcurrency<=4 / dpr>2)
  for (const name in files) {
    if (!name.endsWith(".png")) continue;
    if (name.includes("@2x")) continue;
    // skip non-gameplay (menu/ranking) to save GPU memory
    if (!isGameplayTexture(name)) continue;
     // low-end: drop non-essential first (keep GPU <30MB) — lighting/star/playfield/comboburst, then followpoint 6-9
    if (MAX_TEXTURES === 40) {
       if (["lighting.png","star.png","star2.png","playfield.png","comboburst.png"].includes(name)) continue;
       if (name.match(/^followpoint-[6-9]\.png$/)) continue;
    }
     // skip numbered hit variants like hit0-0.png (60 variants per hit) — only need base hit0.png
    if (name.match(/^hit(0|50|100|300)[k]?-\d+\.png$/)) continue;
    if (name.match(/^followpoint-\d+\.png$/)) {
       const idx = parseInt(name.match(/followpoint-(\d+)\.png/)[1], 10);
       if (idx > 9) continue; // only 0-9 needed for animation, skin has 0-60
    }
    if (loadedCount >= MAX_TEXTURES) { clog("skin-loader", "texture cap reached, skipping", name); continue; }

    const resolvedName = resolveTextureName(name);
    if (!resolvedName) continue;

    const bestName = pickBestResolution(files, name);
    const buf = files[bestName] || files[name];
    if (!buf) continue;

    const blob = new Blob([buf], { type: "image/png" });
    const url = URL.createObjectURL(blob);
    textures[resolvedName] = { url, buffer: buf };
    // also handle combos- -> score- mapping for WhiteCat combos-*.png
    if (name.startsWith("combos-")) {
       const scoreKey = name.replace("combos-", "score-");
       if (!textures[scoreKey]) textures[scoreKey] = { url, buffer: buf };
    }
    if (name.startsWith("numbers-")) {
       const scoreKey = name.replace("numbers-", "score-");
       if (!textures[scoreKey]) textures[scoreKey] = { url, buffer: buf };
       const digitKey = name.replace("numbers-", "");
       if (!textures[digitKey]) textures[digitKey] = { url, buffer: buf };
    }
    usedFiles.add(bestName);
    usedFiles.add(name);
    loadedCount++;
  }
  clog("skin-loader", "filtered textures", loadedCount, "from", Object.keys(files).filter(k=>k.endsWith(".png")).length, "png files");

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
export async function applySkin(skinData) {
  if (!skinData) return;

  // Apply textures — use Assets.load with parser:"texture" for blob: URLs (no extension, needs parser per Assets skill)
  // Most performant: concurrent with cap, only selected skin via loadCachedSkin, whitelist already 60/40
  if (skinData.textures && window.Skin) {
    const keys = Object.keys(skinData.textures);
    clog("skin-loader", "applying", keys.length, "textures (capped)");
    const CONCURRENCY = 6;
    const loadOne = async (key) => {
      try {
        const url = skinData.textures[key].url;
        let tex;
        try {
          if (PIXI.Assets && PIXI.Assets.cache && PIXI.Assets.cache.has(url)) {
            tex = PIXI.Assets.cache.get(url);
          } else {
            try {
              tex = await PIXI.Assets.load({ src: url, parser: "texture", data: { scaleMode: "linear", autoGenerateMipmaps: false } });
            } catch {
              tex = PIXI.Texture.from(url);
            }
            try { if (PIXI.Assets && PIXI.Assets.cache) PIXI.Assets.cache.set(url, tex); } catch (_) {}
          }
        } catch (e) {
          tex = PIXI.Texture.from(url);
        }
        if (tex && tex.source) {
          tex.source.autoGenerateMipmaps = false;
          tex.source.scaleMode = 'linear';
          const doRevoke = () => { try { URL.revokeObjectURL(url); } catch {} };
          if (tex.valid) {
            if (tex.source.once) tex.source.once("update", doRevoke);
            setTimeout(doRevoke, 500);
          } else {
            if (tex.source.once) tex.source.once("loaded", doRevoke);
            tex.once?.("update", doRevoke);
            setTimeout(() => { if (tex.valid) doRevoke(); }, 2000);
          }
        }
        const old = window.Skin?.[key];
        if (old && old !== tex && old !== PIXI.Texture.WHITE && typeof old.destroy === "function") {
          try { old.destroy(false); } catch {}
        }
        if (window.Skin) window.Skin[key] = tex;
      } catch (e) {
        cwarn("skin-loader", "texture apply failed:", key, e);
      }
    };
    for (let i = 0; i < keys.length; i += CONCURRENCY) {
      const chunk = keys.slice(i, i + CONCURRENCY);
      await Promise.all(chunk.map(loadOne));
    }
    clog("skin-loader", "queued", keys.length, "textures");
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

// ── Cache skin in IndexedDB (single active skin for fast load) ──
const DB_NAME = "webosu-skins";
const STORE_NAME = "skinFiles";
const LOCAL_STORE = "localSkins"; // multi-skin vault

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) req.result.createObjectStore(STORE_NAME);
      if (!req.result.objectStoreNames.contains(LOCAL_STORE)) req.result.createObjectStore(LOCAL_STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── Local skin vault (multiple skins, best performance via IndexedDB) ──
let _localSkinCache = null; // in-memory cache of metadata list
export async function listLocalSkins() {
  if (_localSkinCache) return _localSkinCache;
  try {
    const db = await openDB();
    const tx = db.transaction(LOCAL_STORE, "readonly");
    const store = tx.objectStore(LOCAL_STORE);
    const all = await new Promise((res, rej) => {
      const req = store.getAll();
      req.onsuccess = () => res(req.result || []);
      req.onerror = () => rej(req.error);
    });
    db.close();
    _localSkinCache = all.sort((a,b) => (b.updated||0)-(a.updated||0));
    return _localSkinCache;
  } catch (e) { cwarn("skin-loader", "listLocalSkins failed", e); return []; }
}
export async function saveLocalSkin(skinData, fileName) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
  const meta = {
    id,
    name: skinData.config?.name || fileName.replace(/\.osk$/i, "") || "Unnamed",
    author: skinData.config?.author || "",
    fileName,
    texCount: Object.keys(skinData.textures).length,
    sndCount: Object.keys(skinData.sounds).length,
    updated: Date.now(),
    // store raw buffers for best performance (no re-parse)
    _textures: skinData.textures,
    _sounds: skinData.sounds,
    _config: skinData.config,
  };
  // also store in active cache for instant apply
  await cacheSkin(skinData);
  // persist to vault
  try {
    const db = await openDB();
    const tx = db.transaction(LOCAL_STORE, "readwrite");
    tx.objectStore(LOCAL_STORE).put(meta);
    await new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    db.close();
    _localSkinCache = null; // invalidate
    // also remember active id in localStorage for fast startup
    try { localStorage.setItem("webosu_active_skin", id); } catch {}
    clog("skin-loader", "saved local skin", meta.name, id);
    return meta;
  } catch (e) { cwarn("skin-loader", "saveLocalSkin failed", e); return null; }
}
export async function loadLocalSkin(id) {
  try {
    const db = await openDB();
    const tx = db.transaction(LOCAL_STORE, "readonly");
    const rec = await new Promise((res, rej) => {
      const r = tx.objectStore(LOCAL_STORE).get(id);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    db.close();
    if (!rec) return null;
    // reconstruct skinData from stored buffers (already have URLs? recreate)
    const textures = {};
    for (const k in rec._textures) {
      const e = rec._textures[k];
      // e may be {url, buffer} or already buffer; handle both
      const buf = e.buffer || e;
      const blob = new Blob([buf], { type: "image/png" });
      textures[k] = { url: URL.createObjectURL(blob), buffer: buf };
    }
    const sounds = {};
    for (const k in rec._sounds) {
      const e = rec._sounds[k];
      const buf = e.buffer || e;
      const blob = new Blob([buf], { type: "audio/wav" });
      sounds[k] = { url: URL.createObjectURL(blob), buffer: buf };
    }
    const skinData = { textures, sounds, config: rec._config, rawFiles: {} };
    await cacheSkin(skinData);
    try { localStorage.setItem("webosu_active_skin", id); } catch {}
    clog("skin-loader", "loaded local skin", rec.name);
    return skinData;
  } catch (e) { cwarn("skin-loader", "loadLocalSkin failed", e); return null; }
}
export async function deleteLocalSkin(id) {
  try {
    const db = await openDB();
    const tx = db.transaction(LOCAL_STORE, "readwrite");
    tx.objectStore(LOCAL_STORE).delete(id);
    await new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    db.close();
    _localSkinCache = null;
    const cur = (()=>{ try{ return localStorage.getItem("webosu_active_skin"); }catch{return null; }})();
    if (cur === id) try { localStorage.removeItem("webosu_active_skin"); } catch {}
    return true;
  } catch (e) { cwarn("skin-loader", "deleteLocalSkin failed", e); return false; }
}
export async function getActiveSkinId() {
  try { return localStorage.getItem("webosu_active_skin"); } catch { return null; }
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
    if (import.meta.env.DEV) console.warn("skin cache failed:", e);
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
    if (import.meta.env.DEV) console.warn("skin clear failed:", e);
  }
}
