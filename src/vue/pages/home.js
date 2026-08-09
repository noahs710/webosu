import { ref, onMounted } from "vue";
import BeatmapList from "../components/BeatmapList.vue";
import ActivityFeed from "../components/ActivityFeed.vue";

export default {
  components: { BeatmapList, ActivityFeed },
  setup() {
    const likedSids = ref([]);
    const historySids = ref([]);
    const randomSrc = ref("");
    const randomKey = ref(0);
    function makeRandomSrc() {
      const offset = Math.floor(Math.random() * 400);
      return `https://catboy.best/api/v2/search?q=&limit=6&offset=${offset}&status=1&status=3&status=4&mode=0`;
    }
    function randomize() {
      randomSrc.value = makeRandomSrc();
      randomKey.value++;
      if (import.meta.env.DEV) console.log("[Home] randomize", randomSrc.value);
    }
    onMounted(async () => {
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
      randomSrc.value = makeRandomSrc();
    });
    return { likedSids, historySids, randomSrc, randomKey, randomize };
  },
  template: `
    <div class="max-w-[1400px] mx-auto px-4 pt-2">
      <ActivityFeed />
      <h2 class="text-xl font-bold text-white mt-4 mb-2">Popular beatmaps</h2>
      <BeatmapList src="https://catboy.best/api/v2/search?q=&limit=6&offset=20&status=3&mode=0" :limit="6" />
      <h2 class="text-xl font-bold text-white mt-6 mb-2">New beatmaps</h2>
      <BeatmapList src="https://catboy.best/api/v2/search?q=&limit=6&status=4&mode=0" :limit="6" />
      <h2 class="text-xl font-bold text-white mt-6 mb-2">Recently played</h2>
      <BeatmapList :sids="historySids" :limit="6" empty-message="You haven't played any Beatmaps yet!" />
      <h2 class="text-xl font-bold text-white mt-6 mb-2">Favorites</h2>
      <BeatmapList :sids="likedSids" :limit="6" empty-message="You haven't favorited any Beatmaps yet!" />
      <div class="flex items-center gap-3 mt-6 mb-2">
        <h2 class="text-xl font-bold text-white">Random beatmaps</h2>
        <button @click="randomize" class="text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-full px-3 py-1 text-lazer-dim hover:text-white">↻ Randomize</button>
      </div>
      <BeatmapList :key="randomKey" :src="randomSrc" :limit="6" empty-message="No random maps found — hit Randomize to try again." />
      <div class="text-lazer-dim text-sm mt-8 mb-4 text-center">
        <span class="mx-2">Beatmap Mirror <a href="https://catboy.best/" class="text-lazer-pink">Mino</a></span>
        <span class="mx-2">Source code: <a href="https://github.com/BlaNKtext/webosu" class="text-lazer-pink">Github</a></span>
      </div>
    </div>
  `
};
