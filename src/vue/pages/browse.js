import { createApp, onMounted } from "vue";
import "../styles.css";
import Nav from "../components/Nav.vue";
import BeatmapList from "../components/BeatmapList.vue";
import { ensureGame } from "../game-loader.js";

createApp({
  components: { Nav, BeatmapList },
  setup() {
    onMounted(() => {
      document.addEventListener("beatmap-launch", async (e) => {
        const { setId, beatmapId, version } = e.detail;
        try {
          await ensureGame();
          const r = await fetch("https://catboy.best/d/" + setId + "n");
          window.launchGame(new Blob([await r.arrayBuffer()]), beatmapId, version);
        } catch (err) { console.warn("launch failed:", err); alert("Could not start: " + (err.message || err)); }
      });
    });
  },
  template: `
    <Nav active="browse" />
    <div class="main-page max-w-[1400px] mx-auto px-4 pt-4">
      <h2 class="text-xl font-bold text-white mb-3">Browse</h2>
      <BeatmapList src="https://catboy.best/api/v2/search?q=&limit=24&mode=0&status=4" :limit="24" />
    </div>
  `
}).mount("#app");
