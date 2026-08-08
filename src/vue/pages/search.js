import { createApp, ref, onMounted } from "vue";
import "../styles.css";
import Nav from "../components/Nav.vue";
import BeatmapList from "../components/BeatmapList.vue";
import { ensureGame } from "../game-loader.js";

createApp({
  components: { Nav, BeatmapList },
  setup() {
    const query = ref(new URLSearchParams(location.search).get("q") || "");
    const listSrc = ref("");
    let debounce = null;

    function searchUrl(q) {
      const t = q.trim();
      if (/^\d+$/.test(t)) return "https://catboy.best/api/v2/beatmapsets?ids=" + encodeURIComponent(t);
      const p = new URLSearchParams({ q: t, limit: 24, mode: 0 });
      p.append("status", "1"); p.append("status", "3"); p.append("status", "4");
      return "https://catboy.best/api/v2/search?" + p;
    }
    function run(q) { listSrc.value = searchUrl(q); }
    function onInput() {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const v = query.value.trim();
        if (v.length >= 2 || /^\d+$/.test(v)) run(v);
      }, 300);
    }
    function onSubmit() { clearTimeout(debounce); run(query.value); }

    onMounted(() => {
      if (query.value.trim()) run(query.value);
      document.addEventListener("beatmap-launch", async (e) => {
        const { setId, beatmapId, version } = e.detail;
        try {
          await ensureGame();
          const r = await fetch("https://catboy.best/d/" + setId + "n");
          window.launchGame(new Blob([await r.arrayBuffer()]), beatmapId, version);
        } catch (err) { console.warn("launch failed:", err); alert("Could not start: " + (err.message || err)); }
      });
    });

    return { query, listSrc, onInput, onSubmit };
  },
  template: `
    <Nav />
    <div class="main-page max-w-[1400px] mx-auto px-4 pt-4">
      <h2 class="text-xl font-bold text-white mb-3">Search</h2>
      <form @submit.prevent="onSubmit" class="mb-4">
        <input v-model="query" @input="onInput" type="text"
          placeholder="Search for a beatmap or enter a Set ID"
          class="w-full max-w-[600px] bg-lazer-panel2 border border-white/8 rounded-full px-4 py-2.5 text-lazer-text focus:border-lazer-pink focus:outline-none" />
      </form>
      <BeatmapList :src="listSrc" :limit="24" />
    </div>
  `
}).mount("#app");
