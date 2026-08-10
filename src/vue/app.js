import { createApp, onMounted } from "vue";
import "./styles.css";
import { router } from "./router.js";
import Nav from "./components/Nav.vue";
import { ensureGame } from "./game-loader.js";
import "../shell/api.js"; // side effect: sets window.WebosuAPI for game score submission
window.__ensureGame = ensureGame;

// Loading overlay for beatmap launch — visible during download + unzip + parse
function showLoadingOverlay(title, artist) {
   // remove existing overlay if present (prevents duplicate IDs)
   const existing = document.getElementById("beatmap-loading-overlay");
   if (existing) existing.remove();
   const el = document.createElement("div");
   el.id = "beatmap-loading-overlay";
   Object.assign(el.style, {
      position: "fixed", inset: "0", zIndex: "9999",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      background: "rgba(12,12,20,0.92)", backdropFilter: "blur(8px)",
      color: "#ececf4", fontFamily: "Comfortaa, sans-serif",
      transition: "opacity 0.2s",
   });
   el.innerHTML = `
      <div style="margin-bottom:24px;text-align:center">
         <div style="font-size:1.3em;font-weight:bold;margin-bottom:4px;max-width:600px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${title || "Loading..."}</div>
         <div style="font-size:0.9em;opacity:0.6;max-width:600px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${artist || ""}</div>
      </div>
      <div id="beatmap-loading-spinner" style="width:40px;height:40px;border:3px solid rgba(255,255,255,0.15);border-top-color:#ff66aa;border-radius:50%;animation:bl-spin 0.8s linear infinite"></div>
      <div id="beatmap-loading-text" style="margin-top:16px;font-size:0.85em;opacity:0.7">Starting...</div>
   `;
   // inject keyframe animation if not already present
   if (!document.getElementById("bl-spin-keyframes")) {
      const style = document.createElement("style");
      style.id = "bl-spin-keyframes";
      style.textContent = "@keyframes bl-spin{to{transform:rotate(360deg)}}";
      document.head.appendChild(style);
   }
   document.body.appendChild(el);
   return {
      setText(t) { const e = document.getElementById("beatmap-loading-text"); if (e) e.textContent = t; },
      remove() { el.style.opacity = "0"; setTimeout(() => el.remove(), 200); },
   };
}

// Game area + pause menu must be in light DOM (game code accesses by ID)
const gameAreaHTML = `
  <div class="game-area" id="game-area" hidden></div>
  <div class="pause-menu" id="pause-menu" hidden>
    <div class="paused-title">Paused</div>
    <div class="button-list">
      <div class="pausebutton continue" id="pausebtn-continue"><div class="inner">Continue</div></div>
      <div class="pausebutton retry" id="pausebtn-retry"><div class="inner">Retry</div></div>
      <div class="pausebutton quit" id="pausebtn-quit"><div class="inner">Quit</div></div>
    </div>
  </div>`;

const app = createApp({
  components: { Nav },
  setup() {
    onMounted(() => {
      // inject game-area + pause-menu into the DOM (outside Vue's control)
      document.body.insertAdjacentHTML("beforeend", gameAreaHTML);

      // global beatmap-launch handler — always no-video for 0 download impact (video scrapped)
      document.addEventListener("beatmap-launch", async (e) => {
         const { setId, beatmapId, version, title, artist } = e.detail;
         // show loading overlay immediately so the user sees progress
         const overlay = showLoadingOverlay(title, artist);
         try {
            await ensureGame();
            overlay.setText("Downloading beatmap...");
            const suffix = "n"; // always no-video for speed
            if (import.meta.env.DEV) console.log("[app] launch beatmap", { setId, beatmapId, version, url: "https://catboy.best/d/" + setId + suffix });
            const r = await fetch("https://catboy.best/d/" + setId + suffix);
            if (!r.ok) throw new Error("download " + r.status);
            const ab = await r.arrayBuffer();
            overlay.setText("Unzipping & parsing...");
            // let the overlay paint before the sync unzip/parse
             await new Promise(requestAnimationFrame);
             window.launchGame(new Blob([ab]), beatmapId, version);
             // overlay is removed by the worker's onmessage handler (on result/error)
          } catch (err) {
             const overlay = document.getElementById("beatmap-loading-overlay");
             if (overlay) overlay.remove();
            if (import.meta.env.DEV) console.warn("launch failed:", err);
            alert("Could not start: " + (err.message || err));
         }
      });

      // replay watch: ?watch=<replayId>&bid=<beatmapId>&sid=<setId>&v=<version>
      const q = new URLSearchParams(location.search);
      const watch = q.get("watch");
      if (watch) {
        ensureGame();
        const replayOverlay = showLoadingOverlay("Loading replay...", "");
        const checkReady = () => {
          if (window.Osu && window.scriptReady && window.skinReady && window.soundReady && typeof window.launchReplay === "function") {
            fetch("/api/replays/" + watch)
              .then((r) => r.json())
              .then((frames) => {
                if (!Array.isArray(frames) || !frames.length) { replayOverlay.remove(); alert("Replay unavailable for this score."); return; }
                replayOverlay.setText("Downloading beatmap...");
                const suffix = "n";
                return fetch("https://catboy.best/d/" + q.get("sid") + suffix)
                  .then((r) => r.arrayBuffer())
                  .then((ab) => { window.launchReplay(new Blob([ab]), parseInt(q.get("bid") || "0"), q.get("v") || "", frames); });
              })
              .catch((e) => { replayOverlay.remove(); alert("Could not start replay: " + (e.message || e)); });
          } else setTimeout(checkReady, 200);
        };
        checkReady();
      }
    });
  },
  template: `
    <div id="main-page">
      <Nav />
      <router-view />
    </div>
  `,
});

app.use(router);
app.mount("#vue-app");
