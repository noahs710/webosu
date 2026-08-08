import { ref, onMounted } from "vue";
import BeatmapList from "../components/BeatmapList.vue";
export default {
  components: { BeatmapList },
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
    });
    return { sids };
  },
  template: `
    <div class="max-w-[1400px] mx-auto px-4 pt-4">
      <h2 class="text-xl font-bold text-white mb-3">Play history</h2>
      <BeatmapList :sids="sids" :limit="60" empty-message="You haven't played any beatmaps yet." />
    </div>
  `
};
