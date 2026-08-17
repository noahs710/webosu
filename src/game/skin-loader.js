// skin-loader.js — Unified .osk skin file loading for webosu
// Extracts a .osk (renamed .zip) and applies all elements:
// textures (PNG → PIXI.Texture), hitsounds (WAV/OGG → Howler), and skin.ini config.
// Uses blob URLs for efficient texture loading and IndexedDB for caching.

import { unzipSync } from "fflate";
import { log as clog, warn as cwarn } from "./logger.js";
import {
   OSK_NAME_MAP,
   OSK_EXTRA_TEXTURES,
   HITSOUND_NAMES,
   isGameplayTexture,
   isGameplaySound,
} from "./skin-filter.js";

// ── Name mapping, texture filter, and hitsound names imported from skin-filter.js ──

// ── skin.ini parser ──
const SKIN_CACHE_VERSION = "v4-2026-reforged-fix"; // bump when cache schema changes — v4 fixes 85→145 texture count for Default Reforged
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
      hitCircleOverlap: -2, // lazer default (T14 D6): slightly widened; was 0
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
         else if (key === "SliderStyle")
            config.sliderStyle = parseInt(val) || 2;
         else if (key === "SliderBallFrames")
            config.sliderBallFrames = parseInt(val) || 0;
         else if (key === "AllowSliderBallTint")
            config.allowSliderBallTint = val === "1";
      } else if (section === "colours") {
         if (key.startsWith("Combo")) {
            const rgb = val.split(",").map((v) => parseInt(v.trim()) || 0);
            if (rgb.length >= 3)
               config.comboColors.push((rgb[0] << 16) | (rgb[1] << 8) | rgb[2]);
         } else if (key === "SliderBorder") {
            const rgb = val.split(",").map((v) => parseInt(v.trim()) || 0);
            config.sliderBorder = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
         } else if (key === "SliderTrackOverride") {
            const rgb = val.split(",").map((v) => parseInt(v.trim()) || 0);
            config.sliderTrackOverride =
               (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
         } else if (key === "ApproachCircle") {
            const rgb = val.split(",").map((v) => parseInt(v.trim()) || 0);
            config.approachCircle = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
         }
      } else if (section === "fonts") {
         if (key === "HitCirclePrefix") config.hitCirclePrefix = val;
         else if (key === "HitCircleOverlap")
            config.hitCircleOverlap = parseInt(val) || 0;
         else if (key === "ScorePrefix") config.scorePrefix = val;
         else if (key === "ScoreOverlap")
            config.scoreOverlap = parseInt(val) || 0;
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
      if (
         /^[a-z]-/.test(base) ||
         /^[a-z]\.png$/.test(base) ||
         /^[0-9]\.png$/.test(base) ||
         base === "comma.png" ||
         base === "dot.png" ||
         base === "percent.png" ||
         base === "x.png"
      ) {
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
   if (file.size > 80 * 1024 * 1024)
      throw new Error("osk too large (80MB limit)");
   const ab = await file.arrayBuffer();
   if (ab.byteLength > 80 * 1024 * 1024)
      throw new Error("osk too large (80MB limit)");
   const extracted = unzipSync(new Uint8Array(ab));
   const entryCount = Object.keys(extracted).length;
   if (entryCount > 1000)
      clog("skin-loader", "many files", entryCount, "capping to gameplay 60");
   let tot = 0;
   for (const k in extracted) tot += extracted[k].length;
   if (tot > 300 * 1024 * 1024)
      throw new Error("osk unzipped too large (300MB limit)");
   if (tot > 200 * 1024 * 1024)
      clog(
         "skin-loader",
         "large unzipped",
         (tot / 1024 / 1024).toFixed(1) + "MB",
         "capping",
      );
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
   // (no per-OSK cap — OOM is handled by the onerror hook at the bottom of this file)
    for (const name in files) {
       if (!name.endsWith(".png")) continue;
       if (name.includes("@2x")) continue;
       // Flatten subdir paths BEFORE whitening: "assets/default/default-5.png" → "default-5.png".
       // The whitelist must see the flattened name for the check to pass.
       const flattened = name.split("/").pop().toLowerCase();
       // skip non-gameplay (menu/ranking) to save GPU memory
       if (!isGameplayTexture(flattened)) continue;
       // (no low-end pre-skip — all textures are loaded; OOM is handled reactively below)
       // skip numbered hit variants like hit0-0.png (60 variants per hit) — only need base hit0.png
       if (flattened.match(/^hit(0|50|100|300)[k]?-\d+\.png$/)) continue;
       if (flattened.match(/^followpoint-\d+\.png$/)) {
          const idx = parseInt(flattened.match(/followpoint-(\d+)\.png/)[1], 10);
          if (idx > 9) continue; // only 0-9 needed for animation, skin has 0-60
       }
       // (intentionally uncapped — OOM is handled via the onerror hook below)

       const resolvedName = resolveTextureName(flattened);
      if (!resolvedName) continue;

      const bestName = pickBestResolution(files, name);
      const buf = files[bestName] || files[name];
      if (!buf) continue;

      const blob = new Blob([buf], { type: "image/png" });
      const url = URL.createObjectURL(blob);
      const is2x = bestName.includes("@2x");
      textures[resolvedName] = { url, buffer: buf, is2x };
      // Some skins (e.g. reowoTuna) ship hitcircle.png as disc.png. Alias both ways
      // so the runtime always finds the core hitcircle texture.
      if (resolvedName === "disc.png" && !textures["hitcircle.png"]) {
         textures["hitcircle.png"] = { url, buffer: buf, is2x };
      }
      if (resolvedName === "hitcircle.png" && !textures["disc.png"]) {
         textures["disc.png"] = { url, buffer: buf, is2x };
      }
      // also handle combos- -> score- mapping for WhiteCat combos-*.png
      if (name.startsWith("combos-")) {
         const scoreKey = name.replace("combos-", "score-");
         if (!textures[scoreKey])
            textures[scoreKey] = { url, buffer: buf, is2x };
      }
      if (name.startsWith("numbers-")) {
         const scoreKey = name.replace("numbers-", "score-");
         if (!textures[scoreKey])
            textures[scoreKey] = { url, buffer: buf, is2x };
         const digitKey = name.replace("numbers-", "");
         if (!textures[digitKey])
            textures[digitKey] = { url, buffer: buf, is2x };
      }
      usedFiles.add(bestName);
      usedFiles.add(name);
      loadedCount++;
   }
   clog(
      "skin-loader",
      "filtered textures",
      loadedCount,
      "from",
      Object.keys(files).filter((k) => k.endsWith(".png")).length,
      "png files",
   );

   // Load hitsounds
   const sounds = {};
   for (const name in files) {
      const base = name.replace(/\.(wav|ogg|mp3)$/i, "");
      const ext = name.split(".").pop().toLowerCase();
      if (!HITSOUND_NAMES.includes(base)) continue;
      if (!["wav", "ogg", "mp3"].includes(ext)) continue;

      const buf = files[name];
      const mime =
         ext === "wav"
            ? "audio/wav"
            : ext === "ogg"
              ? "audio/ogg"
              : "audio/mpeg";
      const blob = new Blob([buf], { type: mime });
      sounds[base] = { url: URL.createObjectURL(blob), buffer: buf, ext: ext };
   }

   return { textures, sounds, config, rawFiles: files };
}

// ── Apply skin to the game ──
// Module-level tracking for texture lifecycle (unload-on-switch)
const _activeSkinKeys = new Set(); // blob URLs currently in Assets.cache
const _pendingBlobUrls = new Set(); // all blob URLs created (for error-path cleanup)
window._pendingUnload = null; // [{tex, url}] to unload on playback.destroy()

function trackBlobUrl(blob) {
   const u = URL.createObjectURL(blob);
   _pendingBlobUrls.add(u);
   return u;
}
function revokeAllSkinBlobs() {
   for (const u of _pendingBlobUrls) {
      try {
         URL.revokeObjectURL(u);
      } catch {}
   }
   _pendingBlobUrls.clear();
}

export async function unloadActiveSkin() {
   // don't unload if defaults aren't set yet (can't restore sprite textures)
   if (!window._defaultSkin) return;
   // restore window.Skin to defaults so no sprite holds a destroyed texture
   if (window.Skin) {
      for (const k of Object.keys(window.Skin)) {
         if (!(k in window._defaultSkin)) delete window.Skin[k];
         else window.Skin[k] = window._defaultSkin[k];
      }
   }
   // unload each Assets-managed texture → frees GPU memory
   for (const url of _activeSkinKeys) {
      try {
         if (PIXI.Assets && PIXI.Assets.cache && PIXI.Assets.cache.has(url))
            await PIXI.Assets.unload(url);
      } catch {}
   }
   _activeSkinKeys.clear();
   revokeAllSkinBlobs();
}

export async function applySkin(skinData) {
   if (!skinData) return;

   // If a previous skin is active, unload it first (safe when no game is running)
   const gameRunning = !!(window.playback && !window.playback.ended);
   if (_activeSkinKeys.size > 0 && !gameRunning) {
      try {
         await unloadActiveSkin();
      } catch {}
   }

   // Reset to default before applying new skin to prevent accumulation and exponential scaling
   if (window._defaultSkin && window.Skin) {
      // If game is running, capture old textures for deferred unload
      if (gameRunning && _activeSkinKeys.size > 0) {
         if (!window._pendingUnload) window._pendingUnload = [];
         for (const k in window.Skin) {
            const t = window.Skin[k];
            if (t && t !== PIXI.Texture.WHITE && !(k in window._defaultSkin)) {
               try {
                  window._pendingUnload.push({
                     tex: t,
                     url: t.source?.url || null,
                  });
               } catch {}
            }
         }
      }
      // remove custom keys not in default
      for (const k in window.Skin) {
         if (!(k in window._defaultSkin)) {
            delete window.Skin[k];
         }
      }
      // restore defaults for keys not overridden by new skin
      for (const k in window._defaultSkin) {
         if (!skinData.textures || !skinData.textures[k]) {
            if (window.Skin[k] !== window._defaultSkin[k]) {
               window.Skin[k] = window._defaultSkin[k];
            }
         }
      }
   }

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
               if (
                  PIXI.Assets &&
                  PIXI.Assets.cache &&
                  PIXI.Assets.cache.has(url)
               ) {
                  tex = PIXI.Assets.cache.get(url);
                  _activeSkinKeys.add(url);
               } else {
                  // Use Texture.from for blob URLs — suppress the noisy "was not found in the Cache"
                  // warning that Pixi logs when a blob URL isn't yet in Assets cache (expected).
                  const _warn = console.warn; let _muted = false;
                  try { console.warn = () => {}; _muted = true; tex = PIXI.Texture.from(url); } catch { tex = PIXI.Texture.WHITE; } finally { if (_muted) console.warn = _warn; }
                  try {
                     if (PIXI.Assets && PIXI.Assets.cache)
                        PIXI.Assets.cache.set(url, tex);
                  } catch (_) {}
                  _activeSkinKeys.add(url);
               }
            } catch (e) {
               const _w3=console.warn; let _m3=false;
               try { console.warn=()=>{}; _m3=true; tex = PIXI.Texture.from(url); } catch { tex=PIXI.Texture.WHITE; } finally { if(_m3) console.warn=_w3; }
            }
            if (tex && tex.source) {
                tex.source.autoGenerateMipmaps = false;
                tex.source.scaleMode = "linear";
                if (skinData.textures[key].is2x) {
                   try {
                      tex.source.resolution = 2;
                   } catch {}
                } else {
                   try {
                      if (tex.source.resolution !== 1) tex.source.resolution = 1;
                   } catch {}
                }
                // Normalize texture size: if default texture was 128px and custom is 256px,
                // set resolution = 256/128 = 2 so the sprite renders at the same on-screen size.
                // This ensures all skins show circles, cursor, etc. at the same visual size.
                try {
                   const defaultSizes = window._defaultTexSizes;
                   if (defaultSizes && defaultSizes[key]) {
                      const dw = defaultSizes[key].w;
                      const dh = defaultSizes[key].h;
                      const tw = tex.orig?.width || tex.source?.width || tex.width || 0;
                      const th = tex.orig?.height || tex.source?.height || tex.height || 0;
                      if (dw > 0 && tw > 0) {
                         const ratio = tw / dw;
                         // Only adjust if ratio differs from current resolution (avoid redundant sets)
                         const currentRes = tex.source.resolution || 1;
                         const targetRes = skinData.textures[key].is2x ? 2 : ratio;
                         if (Math.abs(targetRes - currentRes) > 0.01) {
                            tex.source.resolution = targetRes;
                         }
                      }
                   }
                } catch {}
               const doRevoke = () => {
                  try {
                     URL.revokeObjectURL(url);
                  } catch {}
               };
               if (tex.valid) {
                  if (tex.source.once) tex.source.once("update", doRevoke);
                  setTimeout(doRevoke, 500);
               } else {
                  if (tex.source.once) tex.source.once("loaded", doRevoke);
                  tex.once?.("update", doRevoke);
                  setTimeout(() => {
                     if (tex.valid) doRevoke();
                  }, 2000);
               }
            }
            // don't destroy old managed textures (avoids Assets warning/split error) — just overwrite, GC will handle
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
         "normal-hitnormal": [1, "hitnormal"],
         "normal-hitwhistle": [1, "hitwhistle"],
         "normal-hitfinish": [1, "hitfinish"],
         "normal-hitclap": [1, "hitclap"],
         "normal-slidertick": [1, "slidertick"],
         "normal-sliderslide": [1, "sliderslide"],
         "normal-sliderwhistle": [1, "sliderwhistle"],
         "soft-hitnormal": [2, "hitnormal"],
         "soft-hitwhistle": [2, "hitwhistle"],
         "soft-hitfinish": [2, "hitfinish"],
         "soft-hitclap": [2, "hitclap"],
         "soft-slidertick": [2, "slidertick"],
         "soft-sliderslide": [2, "sliderslide"],
         "soft-sliderwhistle": [2, "sliderwhistle"],
         "drum-hitnormal": [3, "hitnormal"],
         "drum-hitwhistle": [3, "hitwhistle"],
         "drum-hitfinish": [3, "hitfinish"],
         "drum-hitclap": [3, "hitclap"],
         "drum-slidertick": [3, "slidertick"],
         "drum-sliderslide": [3, "sliderslide"],
         "drum-sliderwhistle": [3, "sliderwhistle"],
      };
      for (const name in skinData.sounds) {
         const mapping = sampleMap[name];
         if (mapping && window.game.sample && window.game.sample[mapping[0]]) {
            const sndUrl = skinData.sounds[name].url;
            const snd = new Howl({
               src: [sndUrl],
               format: [skinData.sounds[name].ext || "wav"],
               preload: true,
            });
            snd.once("load", () => {
               try {
                  URL.revokeObjectURL(sndUrl);
               } catch {}
            });
            setTimeout(() => {
               try {
                  URL.revokeObjectURL(sndUrl);
               } catch {}
            }, 5000);
            window.game.sample[mapping[0]][mapping[1]] = snd;
         }
      }
      // combobreak is special — game uses sampleComboBreak, not sample.combo
      if (skinData.sounds["combobreak"]) {
         const cbUrl = skinData.sounds["combobreak"].url;
         const snd = new Howl({ src: [cbUrl], format: ["wav"], preload: true });
         snd.once("load", () => {
            try {
               URL.revokeObjectURL(cbUrl);
            } catch {}
         });
         setTimeout(() => {
            try {
               URL.revokeObjectURL(cbUrl);
            } catch {}
         }, 5000);
         window.game.sampleComboBreak = snd;
      }
   }

   // Apply skin.ini config to game
   if (skinData.config && window.game) {
      const c = skinData.config;
      if (c.cursorSize != null) window.game.skinCursorSize = c.cursorSize;
      window.game.skinCursorRotate = c.cursorRotate;
      window.game.skinCursorExpand = c.cursorExpand;
      window.game.skinComboColors =
         c.comboColors.length > 0 ? c.comboColors : null;
      window.game.skinSliderBorder = c.sliderBorder;
      window.game.skinSliderTrackOverride = c.sliderTrackOverride;
      window.game.skinConfig = c;
      window.game.allowSliderBallTint = !!c.allowSliderBallTint;
   }

    // Update hitSpriteScale based on default texture size.
    // Original webosu used circleRadius/60 (visible radius of default 128px texture).
    // Texture normalization via source.resolution ensures custom skins render at
    // the same on-screen size, so /60 stays correct for all skins.
    if (window.game && window.game.circleRadius) {
       window.game.hitSpriteScale = window.game.circleRadius / 60;
       window.game.hitRadius = window.game.circleRadius;
       clog("skin-loader", "hitSpriteScale", window.game.hitSpriteScale, "hitRadius", window.game.hitRadius);
    }

    // Apply aspect-ratio specific overrides (Default Reforged v1.2)
    // The skin ships 6 variants (4x3, 16x10, 16x9, 21x9, 32x9, 43x18). Detect
    // current window aspect and overlay the closest match on top of base skin.
    try { await applyAspectRatioOverlay(); } catch (e) { cwarn("skin-loader", "aspect overlay failed", e); }
}

// ── Aspect-ratio overlay for Default Reforged (Argon 2022) ──
const ASPECT_RATIOS = {
   "4x3": 4/3,
   "16x10": 16/10,
   "16x9": 16/9,
   "43x18": 43/18,
   "21x9": 21/9,
   "32x9": 32/9,
};

function getClosestAspect() {
   const w = window.innerWidth || 1920;
   const h = window.innerHeight || 1080;
   const cur = w / h;
   let best = "16x9", bestDiff = Infinity;
   for (const [k, v] of Object.entries(ASPECT_RATIOS)) {
      const diff = Math.abs(cur - v);
      if (diff < bestDiff) { bestDiff = diff; best = k; }
   }
   return best;
}

export async function applyAspectRatioOverlay() {
   const aspect = getClosestAspect();
   clog("skin-loader", "aspect", aspect, `ratio=${(window.innerWidth/window.innerHeight).toFixed(3)}`);
   let manifest = null;
   try {
      const res = await fetch("/skins/aspect-ratios/manifest.json");
      if (!res.ok) return;
      manifest = await res.json();
   } catch { return; }
   const files = manifest[aspect];
   if (!files || !files.length) return;

   // Load each aspect-specific file as texture override
   const CONCURRENCY = 4;
   const loadOne = async (relPath) => {
      try {
         // relPath like "hit100k.png" or "Assets/mania-hit100.png"
         const url = `/skins/aspect-ratios/${aspect}/${relPath}`;
         const res = await fetch(url);
         if (!res.ok) return;
         const buf = new Uint8Array(await res.arrayBuffer());
         // Determine webosu key (basename lowercased)
         const baseName = relPath.split("/").pop().toLowerCase();
         const { isGameplayTexture } = await import("./skin-filter.js");
         // Allow aspect textures even if isGameplayTexture would filter them
         // (aspect variants are intentional overrides for UI)
         const webosuKey = baseName; // aspect files are already webosu-named
         const blob = new Blob([buf], { type: "image/png" });
         const blobUrl = URL.createObjectURL(blob);
         let tex;
         // Suppress noisy cache miss warning for blob URLs
         const _w2 = console.warn; let _m2=false;
         try { console.warn=()=>{}; _m2=true; tex = PIXI.Texture.from(blobUrl); } catch { tex = PIXI.Texture.WHITE; } finally { if(_m2) console.warn=_w2; }
         if (tex && tex.source) {
            tex.source.scaleMode = "linear";
            tex.source.autoGenerateMipmaps = false;
         }
         if (window.Skin) window.Skin[webosuKey] = tex;
         // Also store is2x variant handling
         if (relPath.includes("@2x")) {
            const baseKey = webosuKey.replace("@2x.png", ".png");
            if (tex && tex.source) try { tex.source.resolution = 2; } catch {}
            if (window.Skin) window.Skin[baseKey] = tex;
         }
         setTimeout(() => { try { URL.revokeObjectURL(blobUrl); } catch {} }, 2000);
      } catch (e) { cwarn("skin-loader", "aspect file failed", relPath, e); }
   };

   for (let i = 0; i < files.length; i += CONCURRENCY) {
      await Promise.all(files.slice(i, i + CONCURRENCY).map(loadOne));
   }
   clog("skin-loader", "aspect overlay applied", aspect, files.length + " files");

   // Re-apply hitSpriteScale if aspect changed anything
   if (window.game && window.game.circleRadius) {
      window.game.hitSpriteScale = window.game.circleRadius / 60;
   }

   // Listen for resize to re-apply on aspect change
   if (!window._aspectListener) {
      window._aspectListener = true;
      let lastAspect = aspect;
      window.addEventListener("resize", () => {
         const cur = getClosestAspect();
         if (cur !== lastAspect) {
            lastAspect = cur;
            applyAspectRatioOverlay().catch(()=>{});
         }
      });
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
         if (!req.result.objectStoreNames.contains(STORE_NAME))
            req.result.createObjectStore(STORE_NAME);
         if (!req.result.objectStoreNames.contains(LOCAL_STORE))
            req.result.createObjectStore(LOCAL_STORE, { keyPath: "id" });
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
      _localSkinCache = all.sort((a, b) => (b.updated || 0) - (a.updated || 0));
      return _localSkinCache;
   } catch (e) {
      cwarn("skin-loader", "listLocalSkins failed", e);
      return [];
   }
}
export async function saveLocalSkin(skinData, fileName) {
   const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
   const meta = {
      id,
      name:
         skinData.config?.name || fileName.replace(/\.osk$/i, "") || "Unnamed",
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
      await new Promise((res, rej) => {
         tx.oncomplete = () => res();
         tx.onerror = () => rej(tx.error);
      });
      db.close();
      _localSkinCache = null; // invalidate
      // also remember active id in localStorage for fast startup
      try {
         localStorage.setItem("webosu_active_skin", id);
      } catch {}
      clog("skin-loader", "saved local skin", meta.name, id);
      return meta;
   } catch (e) {
      cwarn("skin-loader", "saveLocalSkin failed", e);
      return null;
   }
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
      try {
         localStorage.setItem("webosu_active_skin", id);
      } catch {}
      clog("skin-loader", "loaded local skin", rec.name);
      return skinData;
   } catch (e) {
      cwarn("skin-loader", "loadLocalSkin failed", e);
      return null;
   }
}
export async function deleteLocalSkin(id) {
   try {
      const db = await openDB();
      const tx = db.transaction(LOCAL_STORE, "readwrite");
      tx.objectStore(LOCAL_STORE).delete(id);
      await new Promise((res, rej) => {
         tx.oncomplete = () => res();
         tx.onerror = () => rej(tx.error);
      });
      db.close();
      _localSkinCache = null;
      const cur = (() => {
         try {
            return localStorage.getItem("webosu_active_skin");
         } catch {
            return null;
         }
      })();
      if (cur === id)
         try {
            localStorage.removeItem("webosu_active_skin");
         } catch {}
      return true;
   } catch (e) {
      cwarn("skin-loader", "deleteLocalSkin failed", e);
      return false;
   }
}
export async function getActiveSkinId() {
   try {
      return localStorage.getItem("webosu_active_skin");
   } catch {
      return null;
   }
}

export async function cacheSkin(skinData) {
   try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      // Store config
      const configWithVersion = Object.assign({}, skinData.config || {}, {
         cacheVersion: SKIN_CACHE_VERSION,
      });
      store.put(JSON.stringify(configWithVersion), "config");

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
         tx.oncomplete = () => {
            db.close();
            resolve();
         };
         tx.onerror = () => {
            db.close();
            resolve();
         };
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
            // Defensive: a corrupt IndexedDB entry used to throw here and reject
            // the load. Treat as no config and let the rest of the skin apply.
            try {
               results.config = getConfig.result
                  ? JSON.parse(getConfig.result)
                  : null;
            } catch {
               results.config = null;
            }
         };
         getTextures.onsuccess = () => {
            results.rawTextures = getTextures.result || {};
         };
         getSounds.onsuccess = () => {
            results.rawSounds = getSounds.result || {};
         };

         tx.oncomplete = () => {
            db.close();
            // Treat an empty cache as a miss so the caller re-fetches the OSK.
            // (Older sessions may have stored a config/skin.ini entry with no textures.)
            const texCount = results.rawTextures
               ? Object.keys(results.rawTextures).length
               : 0;
            if (texCount === 0) {
               resolve(null);
               return;
            }
            // Invalidate stale cache: version mismatch means old schema
            const cachedVer = results.config && results.config.cacheVersion;
            if (cachedVer !== SKIN_CACHE_VERSION) {
               resolve(null);
               return;
            }
            // Also invalidate if cached texture count is suspiciously low for Default Reforged
            // (old cache had 85, new should have 145+)
            if (texCount > 0 && texCount < 100) {
               clog("skin-loader", "cached skin has too few textures", texCount, "— invalidating");
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
               const blob = new Blob([buf], { type: "audio/wav" });
               sounds[key] = { url: URL.createObjectURL(blob), buffer: buf };
            }
            resolve({ textures, sounds, config: results.config });
         };
         tx.onerror = () => {
            db.close();
            resolve(null);
         };
      });
   } catch (e) {
      return null;
   }
}

// Lightweight metadata read — does NOT create blob URLs (safe for UI display)
export async function getCachedSkinMeta() {
   try {
      const db = await openDB();
      return new Promise((resolve) => {
         const tx = db.transaction(STORE_NAME, "readonly");
         const req = tx.objectStore(STORE_NAME).get("config");
         req.onsuccess = () => {
            db.close();
            // Defensive: a corrupt or non-JSON config blob in IndexedDB used to
            // throw and propagate the rejection. Resolve to null instead.
            let meta = null;
            try {
               meta = req.result ? JSON.parse(req.result) : null;
            } catch {
               meta = null;
            }
            resolve(meta && typeof meta === "object" ? meta : null);
         };
         req.onerror = () => {
            db.close();
            resolve(null);
         };
      });
   } catch {
      return null;
   }
}

export async function clearCachedSkin() {
   try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).clear();
      return new Promise((resolve) => {
         tx.oncomplete = () => {
            db.close();
            resolve();
         };
         tx.onerror = () => {
            db.close();
            resolve();
         };
      });
   } catch (e) {
      if (import.meta.env.DEV) console.warn("skin clear failed:", e);
   }
}

// ── Skin + hitsound validation (health checks) ──

// Validate that the 8 core gameplay textures exist and are valid in the loaded skin.
// Returns { ok, missing[], corrupt[] }
export function validateSkin(skinData) {
   const missing = [];
   const corrupt = [];
   const CORE_TEXTURES = [
      "hitcircleoverlay.png",
      "hitcircle.png",
      "approachcircle.png",
      "cursor.png",
      "hit0.png",
      "hit50.png",
      "hit100.png",
      "hit300.png",
   ];
   // Check both the supplied skinData AND the live window.Skin (the validator is called with null after applySkin).
   const live = (skinData && skinData.textures) || {};
   const textures = Object.keys(live).length ? live : window.Skin || {};
   // Also fall back to the persisted _defaultSkin snapshots — in case applySkin cleared the live keys for a still-loading skin.
   const fallback = window._defaultSkin || {};
   // Some skins rename hitcircle.png -> disc.png via OSK_NAME_MAP; accept either key so the validator matches the runtime.
   const ALIASES = { "hitcircle.png": "disc.png" };
   for (const name of CORE_TEXTURES) {
      const tex =
         textures[name] ||
         textures[ALIASES[name]] ||
         fallback[name] ||
         fallback[ALIASES[name]];
      if (!tex || tex === PIXI.Texture.WHITE) {
         missing.push(name);
      } else if (
         tex.valid === false ||
         (tex.source && tex.source.valid === false)
      ) {
         corrupt.push(name);
      }
   }
   return {
      ok: missing.length === 0 && corrupt.length === 0,
      missing,
      corrupt,
   };
}

// Validate that the 15 core hitsound files loaded.
// sliderslide/spinnerspin are optional (warn if missing, don't block).
// Returns { ok, missing[] }
export function validateHitsounds() {
   const missing = [];
   const REQUIRED = [
      "hitnormal",
      "hitwhistle",
      "hitfinish",
      "hitclap",
      "slidertick",
   ];
   const samples = (window.game && window.game.sample) || [{}, {}, {}, {}];
   for (let set = 1; set <= 3; set++) {
      for (const name of REQUIRED) {
         if (!samples[set] || !samples[set][name]) {
            // only report if ALL three sets are missing this sound (one set missing is ok — user might not have that set)
         }
      }
   }
   // Check at least one set has all required sounds
   let anyComplete = false;
   for (let set = 1; set <= 3; set++) {
      const hasAll = REQUIRED.every(
         (name) => samples[set] && samples[set][name],
      );
      if (hasAll) {
         anyComplete = true;
         break;
      }
   }
   if (!anyComplete) {
      missing.push("hitnormal/hitwhistle/hitfinish/hitclap/slidertick");
   }
   return { ok: missing.length === 0, missing };
}

// Reactive OOM handling: when the GPU runs out of memory decoding a large skin,

// Reactive OOM handling: when the GPU runs out of memory decoding a large skin,
// the browser throws a RangeError on Image.decode. We listen globally and
// remove blob: textures from the Pixi cache so the next render attempt succeeds.
if (typeof window !== "undefined") {
   if (!window.__webosu_oom_hook_installed) {
      window.__webosu_oom_hook_installed = true;
      function isOomError(e) {
         if (!e) return false;
         var s = String((e && e.message) || e || "");
         return /out of memory|RangeError|Array buffer allocation/.test(s);
      }
      function dropNonEssentialTextures() {
         try {
            if (window.PIXI && window.PIXI.Assets && window.PIXI.Assets.cache) {
               var cache = window.PIXI.Assets.cache;
               if (cache && typeof cache.keys === "function") {
                  for (var k of cache.keys()) {
                     if (/^blob:/.test(String(k))) cache.remove(k);
                  }
               }
            }
         } catch (_) {}
      }
      window.addEventListener("error", function (ev) {
         if (isOomError(ev && ev.error ? ev.error : ev && ev.message)) {
            try { dropNonEssentialTextures(); } catch (_) {}
         }
      });
      window.addEventListener("unhandledrejection", function (ev) {
         if (isOomError(ev && ev.reason)) {
            try { dropNonEssentialTextures(); } catch (_) {}
         }
      });
   }
}
