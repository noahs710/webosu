import BeatmapList from "../components/BeatmapList.vue";
export default {
  components: { BeatmapList },
  template: `
    <div class="max-w-[1400px] mx-auto px-4 pt-4">
      <h2 class="text-xl font-bold text-white mb-3">Popular beatmaps</h2>
      <BeatmapList src="https://catboy.best/api/v2/search?q=&limit=24&offset=20&status=3&mode=0" :limit="24" />
    </div>
  `
};
