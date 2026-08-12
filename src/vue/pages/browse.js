import { ref, computed } from "vue";
import BeatmapList from "../components/BeatmapList.vue";
export default {
  components: { BeatmapList },
  setup() {
    const tab = ref("all");
    const src = computed(() => {
      if (tab.value === "popular") return "https://catboy.best/api/v2/search?q=&limit=24&offset=20&status=3&mode=0";
      if (tab.value === "new") return "https://catboy.best/api/v2/search?q=&limit=24&status=4&mode=0";
      return "https://catboy.best/api/v2/search?q=&limit=24&mode=0&status=4";
    });
    return { tab, src };
  },
  template: `
    <div class="max-w-[1400px] mx-auto px-4 pt-4">
      <div class="flex items-center gap-2 mb-3">
        <h2 class="text-xl font-bold text-white">Browse</h2>
        <div class="flex gap-1 ml-2">
          <button v-for="t in [
            { k: 'all', label: 'All' },
            { k: 'popular', label: 'Popular' },
            { k: 'new', label: 'New' },
          ]" :key="t.k" @click="tab = t.k"
            :class="tab === t.k ? 'bg-lazer-pink/16 text-white border-lazer-pink/30' : 'bg-white/5 text-lazer-dim border-white/8 hover:bg-white/10'"
            class="px-3 py-1 rounded-full text-sm border transition-all">{{ t.label }}</button>
        </div>
      </div>
      <BeatmapList :src="src" :limit="24" :key="tab" browse-mode />
    </div>
  `
};