import { createApp, onMounted } from "vue";
import "./styles.css";
import { router } from "./router.js";
import Nav from "./components/Nav.vue";
import { ensureGame } from "./game-loader.js";
import "../shell/api.js"; // side effect: sets window.WebosuAPI for game score submission
window.__ensureGame = ensureGame;

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
        const { setId, beatmapId, version } = e.detail;
        try {
          await ensureGame();
          const suffix = "n"; // always no-video for speed
          if (import.meta.env.DEV) console.log("[app] launch beatmap", { setId, beatmapId, version, url: "https://catboy.best/d/" + setId + suffix });
          const r = await fetch("https://catboy.best/d/" + setId + suffix);
          if (!r.ok) throw new Error("download " + r.status);
          window.launchGame(new Blob([await r.arrayBuffer()]), beatmapId, version);
        } catch (err) { if (import.meta.env.DEV) console.warn("launch failed:", err); alert("Could not start: " + (err.message || err)); }
      });

      // replay watch: ?watch=<replayId>&bid=<beatmapId>&sid=<setId>&v=<version>
      const q = new URLSearchParams(location.search);
      const watch = q.get("watch");
      if (watch) {
        ensureGame();
        const checkReady = () => {
          if (window.Osu && window.scriptReady && window.skinReady && window.soundReady && typeof window.launchReplay === "function") {
            fetch("/api/replays/" + watch)
              .then((r) => r.json())
              .then((frames) => {
                if (!Array.isArray(frames) || !frames.length) { alert("Replay unavailable for this score."); return; }
                const suffix = "n"; // always no-video
                return fetch("https://catboy.best/d/" + q.get("sid") + suffix)
                  .then((r) => r.arrayBuffer())
                  .then((ab) => { window.launchReplay(new Blob([ab]), parseInt(q.get("bid") || "0"), q.get("v") || "", frames); });
              })
              .catch((e) => alert("Could not start replay: " + (e.message || e)));
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
