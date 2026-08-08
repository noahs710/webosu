// ESM custom hitsounds import for v2 settings page. Handles .osk (zip) extraction
// via fflate and individual .ogg/.wav files. Stores hitsounds as base64 in
// gamesettings.soundNames (same format the AMD settings page uses, so the game
// loads them identically). Skin images go to localforage.skinTextures.
import { unzipSync } from "fflate";
import { gamesettings, saveToLocal } from "./gamesettings.js";

const HITSOUND_NAMES = [
  "normal-hitnormal", "normal-hitwhistle", "normal-hitfinish", "normal-hitclap",
  "normal-slidertick", "soft-hitnormal", "soft-hitwhistle", "soft-hitfinish",
  "soft-hitclap", "soft-slidertick", "drum-hitnormal", "drum-hitwhistle",
  "drum-hitfinish", "drum-hitclap", "drum-slidertick", "combobreak",
];

function canonicalName(filename) {
  const base = filename.split("/").pop().replace(/\.[^.]+$/, "").toLowerCase();
  return HITSOUND_NAMES.indexOf(base) !== -1 ? base : null;
}

function isImage(name) {
  return /\.(png|jpe?g)$/i.test(name);
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function initHitsoundImport(root) {
  const input = root.querySelector("#skinhitsound");
  const dropzone = root.querySelector("#oskdrop");
  const statusEl = root.querySelector("#oskstatus");
  if (!input || !dropzone) return;

  function setStatus(text, ok) {
    if (statusEl) { statusEl.textContent = text; statusEl.style.color = ok ? "var(--lazer-pink)" : "var(--lazer-dim)"; }
  }

  async function handleFiles(files) {
    const hitsounds = {};
    const skin = {};
    for (const file of files) {
      if (/\.osk$/i.test(file.name)) {
        try {
          const ab = await file.arrayBuffer();
          const extracted = unzipSync(new Uint8Array(ab));
          for (const path in extracted) {
            const cn = canonicalName(path);
            if (cn) {
              hitsounds[cn] = arrayBufferToBase64(extracted[path].buffer);
            } else if (isImage(path)) {
              const base = path.split("/").pop().toLowerCase();
              skin[base] = arrayBufferToBase64(extracted[path].buffer);
            }
          }
        } catch (e) { setStatus("Could not extract " + file.name, false); return; }
      } else if (/\.(ogg|wav)$/i.test(file.name)) {
        const cn = canonicalName(file.name);
        if (cn) {
          const ab = await file.arrayBuffer();
          hitsounds[cn] = arrayBufferToBase64(ab);
        }
      }
    }

    const hitCount = Object.keys(hitsounds).length;
    const skinCount = Object.keys(skin).length;

    if (hitCount) {
      const existing = gamesettings.soundNames && typeof gamesettings.soundNames === "object" ? gamesettings.soundNames : {};
      gamesettings.soundNames = Object.assign({}, existing, hitsounds);
    }
    if (skinCount && window.localforage) {
      const existing = await new Promise(r => localforage.getItem("skinTextures", (e, v) => r(v && typeof v === "object" ? v : {})));
      localforage.setItem("skinTextures", Object.assign({}, existing, skin));
    }

    if (hitCount || skinCount) {
      gamesettings.loadToGame();
      saveToLocal();
      setStatus("Imported " + hitCount + " hitsound" + (hitCount !== 1 ? "s" : "") + (skinCount ? ", " + skinCount + " skin image" + (skinCount !== 1 ? "s" : "") : "") + ". Applied on next game.", true);
    } else {
      setStatus("No hitsounds or skin images found in the selected file(s).", false);
    }
  }

  input.addEventListener("change", e => { if (e.target.files.length) handleFiles([...e.target.files]); });

  // drag-and-drop
  ["dragenter", "drag"].forEach(ev => dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.add("drag"); }));
  ["dragleave", "drop"].forEach(ev => dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.remove("drag"); }));
  dropzone.addEventListener("drop", e => { if (e.dataTransfer.files.length) handleFiles([...e.dataTransfer.files]); });
}
