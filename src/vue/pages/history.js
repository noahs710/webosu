import { createApp, ref, onMounted } from "vue";
import "../styles.css";
import Nav from "../components/Nav.vue";
import BeatmapList from "../components/BeatmapList.vue";
import { ensureGame } from "../game-loader.js";

createApp({
  components: { Nav, BeatmapList },
  setup() {
    const sids = ref([]);
    onMounted(async () => {
      if (window.localforage) {
        try {
          const hist = await new Promise(r => localforage.getItem("playhistory1000", (e, v) => r(v)));
          if (hist && hist.length) {
            sids.value = [...new Set(hist.map(h => h.sid).filter(Boolean))];
          }
        } catch {}
      }
      document.addEventListener("beatmap-launch", async (e) => {
        const { setId, beatmapId, version } = e.detail;
        try {
          await ensureGame();
          const r = await fetch("https://catboy.best/d/" + setId + "n");
          window.launchGame(new Blob([await r.arrayBuffer()]), beatmapId, version);
        } catch (err) { console.warn("launch failed:", err); alert("Could not start: " + (err.message || err)); }
      });
    });
    return { sids };
  },
  template: `
    <Nav />
    <div class="main-page max-w-[1400px] mx-auto px-4 pt-4">
      <h2 class="text-xl font-bold text-white mb-3">Play history</h2>
      <BeatmapList :sids="sids" :limit="60" empty-message="You haven't played any beatmaps yet." />
    </div>
  `
}).mount("#app");
