import { ref, onMounted } from "vue";
import BeatmapList from "../components/BeatmapList.vue";
import { getFavorites } from "../../shell/favorites.js";
export default {
  components: { BeatmapList },
  setup() {
    const sids = ref([]);
    onMounted(async () => {
      try {
        const set = await getFavorites();
        sids.value = [...set];
      } catch {
        // fallback to local only
        if (window.localforage) {
          const set = await new Promise(r => localforage.getItem("likedsidset", (e, v) => r(v)));
          if (set) sids.value = [...set];
        }
      }
    });
    return { sids };
  },
  template: `
    <div class="max-w-[1400px] mx-auto px-4 pt-4">
      <h2 class="text-xl font-bold text-white mb-3">Favorites</h2>
      <BeatmapList :sids="sids" :limit="60" empty-message="You haven't favorited any beatmaps yet." />
    </div>
  `
};