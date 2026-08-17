import "./pixi.js";
import "./sound.js";
// webosu ESM game entry. Loading this module runs initgame's side effects
// (sets window.game, loads skin + hitsounds via PIXI.Loader, sets window.Osu /
// window.Playback + the skinReady/soundReady/scriptReady readiness flags), and
// exposes the launchers the inline shell scripts call as window globals.
import "./initgame.js";
import { launchGame, launchReplay } from "./launchgame.js";
// Conformance harness hooks: expose the skin pipeline + a scene-tree snapshot so
// scripts/headless-skin-conformance.js can drive a skin import headlessly and
// capture the resulting render tree for golden-snapshot comparison.
import { loadOsk, applySkin } from "./skin-loader.js";


window.launchGame = launchGame;
window.launchReplay = launchReplay;
window.__loadOsk = loadOsk;
window.__applySkin = applySkin;

// __snapshotSkinTree(): returns a stable JSON description of the active skin's
// texture table + the live scene graph leaves (texture uid, pos, scale, rot, tint,
// alpha) sorted for deterministic comparison against golden snapshots.
window.__snapshotSkinTree = function () {
   const out = { textures: {}, scene: [] };
   try {
      const skin = window.Skin || {};
      for (const k of Object.keys(skin).sort()) {
         const t = skin[k];
         out.textures[k] = t && t.source
            ? { w: t.source.width || 0, h: t.source.height || 0, res: t.source.resolution || 1 }
            : null;
      }
   } catch (e) { out.texturesError = String(e); }
   try {
      const walk = (node, path) => {
         if (!node) return;
         const label = path + "/" + (node.label || node.name || node.constructor?.name || "node");
         if (node.texture) {
            out.scene.push({
               p: label,
               tex: node.texture?.source?.uid ?? node.texture?.uid ?? null,
               x: +((node.x ?? 0).toFixed(2)), y: +((node.y ?? 0).toFixed(2)),
               sx: +((node.scale?.x ?? 1).toFixed(3)), sy: +((node.scale?.y ?? 1).toFixed(3)),
               rot: +((node.rotation ?? 0).toFixed(3)),
               tint: node.tint ?? null, a: +((node.alpha ?? 1).toFixed(3)),
            });
         }
         for (const c of node.children || []) walk(c, label);
      };
      if (window.app && window.app.stage) walk(window.app.stage, "stage");
      out.scene.sort((a, b) => (a.p < b.p ? -1 : a.p > b.p ? 1 : 0));
   } catch (e) { out.sceneError = String(e); }
   return out;
};
