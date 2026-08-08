import { createApp, ref, onMounted } from "vue";
import "../styles.css";
import Nav from "../components/Nav.vue";
import BeatmapList from "../components/BeatmapList.vue";
import ActivityFeed from "../components/ActivityFeed.vue";
import { ensureGame } from "../game-loader.js";

createApp({
  components: { Nav, BeatmapList, ActivityFeed },
  setup() {
    const likedSids = ref([]);
    const historySids = ref([]);
    const randomSrc = ref("");

    onMounted(async () => {
      // load liked + history from localforage
      if (window.localforage) {
        try {
          const liked = await new Promise(r => localforage.getItem("likedsidset", (e, v) => r(v)));
          if (liked && liked.size) likedSids.value = Array.from(liked).slice(0, 6);
        } catch {}
        try {
          const hist = await new Promise(r => localforage.getItem("playhistory1000", (e, v) => r(v)));
          if (hist && hist.length) historySids.value = [...new Set(hist.map(h => h.sid).filter(Boolean))].slice(0, 6);
        } catch {}
      }
      // random beatmaps
      const randquery = Math.random().toString(36).replace(/[^a-p]+/g, "").substr(1, 5);
      randomSrc.value = "https://catboy.best/api/v2/search?q=" + randquery + "&limit=6&offset=20&status=3&status=4&status=1&status=-2&mode=0";

      // game launch handler
      document.addEventListener("beatmap-launch", async (e) => {
        const { setId, beatmapId, version } = e.detail;
        try {
          await ensureGame();
          const r = await fetch("https://catboy.best/d/" + setId + "n");
          window.launchGame(new Blob([await r.arrayBuffer()]), beatmapId, version);
        } catch (err) { console.warn("launch failed:", err); alert("Could not start: " + (err.message || err)); }
      });

      // replay watch: ?watch=<replayId>&bid=<beatmapId>&sid=<setId>&v=<version>
      const q = new URLSearchParams(location.search);
      const watch = q.get("watch");
      if (watch) {
        ensureGame();
        const checkReady = () => {
          if (window.Osu && window.scriptReady && window.skinReady && window.soundReady && typeof window.launchReplay === "function") {
            fetch("/api/replays/" + watch).then(r => r.json()).then(frames => {
              if (!Array.isArray(frames) || !frames.length) { alert("Replay unavailable for this score."); return; }
              return fetch("https://catboy.best/d/" + q.get("sid") + "n").then(r => r.arrayBuffer()).then(ab => {
                window.launchReplay(new Blob([ab]), parseInt(q.get("bid") || "0"), q.get("v") || "", frames);
              });
            }).catch(e => alert("Could not start replay: " + (e.message || e)));
          } else setTimeout(checkReady, 200);
        };
        checkReady();
      }
    });

    return { likedSids, historySids, randomSrc };
  },
  template: `
    <Nav />
    <div class="main-page max-w-[1400px] mx-auto px-4 pt-2">
      <ActivityFeed />
      <h2 class="text-xl font-bold text-white mt-4 mb-2">Popular beatmaps</h2>
      <BeatmapList src="https://catboy.best/api/v2/search?q=&limit=6&offset=20&status=3&mode=0" :limit="6" />
      <h2 class="text-xl font-bold text-white mt-6 mb-2">New beatmaps</h2>
      <BeatmapList src="https://catboy.best/api/v2/search?q=&limit=6&status=4&mode=0" :limit="6" />
      <h2 class="text-xl font-bold text-white mt-6 mb-2">Recently played</h2>
      <BeatmapList :sids="historySids" :limit="6" empty-message="You haven't played any Beatmaps yet!" />
      <h2 class="text-xl font-bold text-white mt-6 mb-2">Favorites</h2>
      <BeatmapList :sids="likedSids" :limit="6" empty-message="You haven't favorited any Beatmaps yet!" />
      <h2 class="text-xl font-bold text-white mt-6 mb-2">Random beatmaps</h2>
      <BeatmapList :src="randomSrc" :limit="6" />
      <div class="text-lazer-dim text-sm mt-8 mb-4 text-center">
        <span class="mx-2">Beatmap Mirror <a href="https://catboy.best/" class="text-lazer-pink">Mino</a></span>
        <span class="mx-2">Source code: <a href="https://github.com/BlaNKtext/webosu" class="text-lazer-pink">Github</a></span>
      </div>
    </div>
  `
}).mount("#app");
