import { createApp, ref, onMounted, onUnmounted } from "vue";
import "./styles.css";
import { router } from "./router.js";
import Nav from "./components/Nav.vue";
import ModSelectPanel from "./components/ModSelectPanel.vue";
import HealthCheckPopup from "./components/HealthCheckPopup.vue";
import ErrorPopup from "./components/ErrorPopup.vue";
import { ensureGame } from "./game-loader.js";
import "../shell/api.js"; // side effect: sets window.WebosuAPI for game score submission
import "../game/mods/register.js"; // side effect: registers all mods + window.ModRegistry
window.__ensureGame = ensureGame;

// Loading overlay for beatmap launch — visible during download + unzip + parse
function showLoadingOverlay(title, artist) {
   // remove existing overlay if present (prevents duplicate IDs)
   const existing = document.getElementById("beatmap-loading-overlay");
   if (existing) existing.remove();
   const el = document.createElement("div");
   el.id = "beatmap-loading-overlay";
   Object.assign(el.style, {
      position: "fixed",
      inset: "0",
      zIndex: "9999",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(12,12,20,0.92)",
      backdropFilter: "blur(8px)",
      color: "#ececf4",
      fontFamily: "Comfortaa, sans-serif",
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
      setText(t) {
         const e = document.getElementById("beatmap-loading-text");
         if (e) e.textContent = t;
      },
      remove() {
         el.style.opacity = "0";
         setTimeout(() => el.remove(), 200);
      },
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
      <div class="pausebutton mods" id="pausebtn-mods"><div class="inner">Mods</div></div>
      <div class="pausebutton quit" id="pausebtn-quit"><div class="inner">Quit</div></div>
    </div>
    <div id="pause-mod-panel" hidden></div>
  </div>`;

const app = createApp({
   components: { Nav, ModSelectPanel, HealthCheckPopup, ErrorPopup },
   setup() {
      const showModSidebar = ref(false);
      const healthIssue = ref(null);
      // Foreground error popup — survives map failures by sitting at z-index 11000
      // (above the difficulty-box at 10000 and the loading/grading overlays) and
      // is independent of `window.alert`, which launchgame.js silences during play.
      const errorPopup = ref(null);
      function showError(message, title) {
         errorPopup.value = {
            message: String(message || ""),
            title: title || "Something went wrong",
            id: Date.now(),
         };
      }
      function dismissError() {
         errorPopup.value = null;
      }
      // Expose a non-Vue entry point so launchgame.js (and other game modules) can
      // surface critical errors without depending on the silenced window.alert.
      window.__showErrorPopup = (message, title) => showError(message, title);
      function toggleModSidebar() {
         showModSidebar.value = !showModSidebar.value;
      }
      function closeModSidebar() {
         showModSidebar.value = false;
      }
      window.__toggleModSidebar = toggleModSidebar;
      function onKey(e) {
         if (e.key === "F1") {
            e.preventDefault();
            toggleModSidebar();
         }
         if (e.key === "Escape" && showModSidebar.value) closeModSidebar();
      }
      function onHealthIssue(e) {
         healthIssue.value = e.detail;
      }
      function repairSkin() {
         // trigger a file picker for re-import
         const input = document.createElement("input");
         input.type = "file";
         input.accept = ".osk,.zip";
         input.onchange = () => {
            if (input.files[0]) {
               import("./game-loader.js").then(({}) => {
                  // re-import the skin — dispatch to the skins page logic
                  window.location.href = "/skins";
               });
            }
         };
         input.click();
         healthIssue.value = null;
      }
      function resetDefault() {
         // clear the skin cache and reload
         try {
            localStorage.removeItem("webosu_active_skin");
         } catch {}
         if (window.localforage)
            localforage.removeItem("skinTextures", () => location.reload());
         else location.reload();
         healthIssue.value = null;
      }
      function dismissHealth() {
         healthIssue.value = null;
      }
      onMounted(() => {
         window.addEventListener("keydown", onKey);
         window.addEventListener("skin-health-issue", onHealthIssue);
         // inject game-area + pause-menu into the DOM (outside Vue's control)
         document.body.insertAdjacentHTML("beforeend", gameAreaHTML);

         // Eager-load the game so skin textures + ModRegistry are available globally
         // before the user clicks a beatmap.  This makes the home page's mod
         // sidebar immediately list every registered mod (not 0) and lets any code
         // that introspects window.Skin at runtime see real textures.  Safe to
         // ignore errors here — the actual beatmap launch re-runs ensureGame.
         try {
            ensureGame();
         } catch (e) {
            /* swallowed — fall back to lazy */
         }

         // global beatmap-launch handler — always no-video for 0 download impact (video scrapped)
         document.addEventListener("beatmap-launch", async (e) => {
            const { setId, beatmapId, version, title, artist } = e.detail;
            // show loading overlay immediately so the user sees progress
            const overlay = showLoadingOverlay(title, artist);
            try {
               await ensureGame();
               overlay.setText("Downloading beatmap...");
               const suffix = "n"; // always no-video for speed
               if (import.meta.env.DEV)
                  console.log("[app] launch beatmap", {
                     setId,
                     beatmapId,
                     version,
                     url: "https://catboy.best/d/" + setId + suffix,
                  });
               const benchBundle = new URLSearchParams(location.search).get(
                  "benchBundle",
               );
               const url = benchBundle
                  ? "/bench-bundle/" +
                    benchBundle +
                    (/\.(osu|osz)$/.test(benchBundle) ? "" : ".osz")
                  : "https://catboy.best/d/" + setId + suffix;
               const r = await fetch(url);
               if (!r.ok) throw new Error("download " + r.status);
               const ab = await r.arrayBuffer();
               overlay.setText("Unzipping & parsing...");
               // let the overlay paint before the sync unzip/parse
               await new Promise(requestAnimationFrame);
               window.launchGame(new Blob([ab]), beatmapId, version);
               // overlay is removed by the worker's onmessage handler (on result/error)
            } catch (err) {
               const overlay = document.getElementById(
                  "beatmap-loading-overlay",
               );
               if (overlay) overlay.remove();
               if (import.meta.env.DEV) console.warn("launch failed:", err);
               showError("Could not start: " + (err.message || err));
            }
         });

         // replay watch: ?watch=<replayId>&bid=<beatmapId>&sid=<setId>&v=<version>
         const q = new URLSearchParams(location.search);
         const watch = q.get("watch");
         if (watch) {
            ensureGame();
            const replayOverlay = showLoadingOverlay("Loading replay...", "");
            const checkReady = () => {
               if (
                  window.Osu &&
                  window.scriptReady &&
                  window.skinReady &&
                  window.soundReady &&
                  typeof window.launchReplay === "function"
               ) {
                  fetch("/api/replays/" + watch)
                     .then((r) => r.json())
                     .then((frames) => {
                        if (!Array.isArray(frames) || !frames.length) {
                           replayOverlay.remove();
                           showError("Replay unavailable for this score.");
                           return;
                        }
                        replayOverlay.setText("Downloading beatmap...");
                        const suffix = "n";
                        return fetch(
                           "https://catboy.best/d/" + q.get("sid") + suffix,
                        )
                           .then((r) => r.arrayBuffer())
                           .then((ab) => {
                              window.launchReplay(
                                 new Blob([ab]),
                                 parseInt(q.get("bid") || "0"),
                                 q.get("v") || "",
                                 frames,
                              );
                           });
                     })
                     .catch((e) => {
                        replayOverlay.remove();
                        showError(
                           "Could not start replay: " + (e.message || e),
                        );
                     });
               } else setTimeout(checkReady, 200);
            };
            checkReady();
         }
      });
      onUnmounted(() => {
         window.removeEventListener("keydown", onKey);
         window.removeEventListener("skin-health-issue", onHealthIssue);
      });
      return {
         showModSidebar,
         toggleModSidebar,
         closeModSidebar,
         healthIssue,
         repairSkin,
         resetDefault,
         dismissHealth,
         errorPopup,
         dismissError,
      };
   },
   template: `
    <div id="main-page">
      <Nav @toggle-mods="toggleModSidebar" />
      <router-view />
      <!-- Mod sidebar drawer -->
      <teleport to="body">
        <div v-if="showModSidebar" class="mod-sidebar-backdrop" @click="closeModSidebar"></div>
        <div class="mod-sidebar" :class="{ open: showModSidebar }">
          <div class="mod-sidebar-header">
            <span class="text-lazer-pink font-bold text-lg">Mods</span>
            <button @click="closeModSidebar" class="text-lazer-dim hover:text-white text-xl leading-none">✕</button>
          </div>
          <div class="mod-sidebar-body">
            <ModSelectPanel />
          </div>
        </div>
      </teleport>
      <!-- Health-check popup -->
      <teleport to="body">
        <HealthCheckPopup v-if="healthIssue"
          :issueType="healthIssue.type"
          :message="healthIssue.message"
          :missing="healthIssue.missing || []"
          :corrupt="healthIssue.corrupt || []"
          @repair="repairSkin"
          @reset="resetDefault"
          @dismiss="dismissHealth"
        />
      </teleport>
      <!-- Foreground error popup — z-index 2147483647 (max int) keeps it above
           the game canvas, loading overlay, grading screen, and difficulty popup. -->
      <teleport to="body">
        <ErrorPopup v-if="errorPopup"
          :key="errorPopup.id"
          :message="errorPopup.message"
          :title="errorPopup.title"
          @dismiss="dismissError"
        />
      </teleport>
    </div>
  `,
});

app.use(router);
app.mount("#vue-app");

