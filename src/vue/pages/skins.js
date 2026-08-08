import { createApp, ref, onMounted } from "vue";
import "../styles.css";
import Nav from "../components/Nav.vue";
import { api } from "../../shell/api.js";

createApp({
  components: { Nav },
  setup() {
    const skins = ref([]);
    const status = ref("");
    const uploading = ref(false);

    async function load() {
      try { skins.value = await api.skins(); } catch { skins.value = []; }
    }
    async function upload(e) {
      const f = e.target.files[0];
      if (!f) return;
      if (!api.isLoggedIn()) { status.value = "Log in to share skins."; return; }
      uploading.value = true; status.value = "Uploading " + f.name + "...";
      try {
        const ab = await f.arrayBuffer();
        const r = await api.uploadSkin(f.name.replace(/\.osk$|\.zip$/i, ""), f.name, ab);
        status.value = "Shared as #" + r.id + "!"; load();
      } catch (e) { status.value = "Upload failed: " + (e.message || e); }
      uploading.value = false;
    }
    onMounted(load);
    return { skins, status, uploading, upload };
  },
  template: `
    <Nav active="skins" />
    <div class="main-page max-w-[1400px] mx-auto px-4 pt-4">
      <h2 class="text-xl font-bold text-white mb-3">Skins</h2>
      <p class="text-lazer-dim text-sm mb-3">Share your .osk and apply others'. Custom hitsounds and skin textures are applied on your next game.</p>
      <input type="file" accept=".osk,.zip" @change="upload" class="mb-2" />
      <span class="text-sm text-lazer-dim ml-2">{{ status }}</span>
      <div v-if="skins.length" class="grid gap-3 mt-4" style="grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));">
        <div v-for="s in skins" :key="s.id" class="bg-lazer-panel border border-white/8 rounded-xl p-3">
          <div class="font-bold text-lazer-text">{{ s.name }}</div>
          <div class="text-sm text-lazer-dim">by {{ s.author || '?' }} · {{ s.downloads || 0 }} dl</div>
          <a :href="api.skinDownloadUrl(s.id)" class="text-lazer-pink text-sm">Download</a>
        </div>
      </div>
      <div v-else class="text-lazer-dim p-4">No skins shared yet. Be the first to upload one!</div>
    </div>
  `
}).mount("#app");
