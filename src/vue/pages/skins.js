import { ref, onMounted } from "vue";
import { api } from "../../shell/api.js";
import { clearCachedSkin, listLocalSkins, saveLocalSkin, loadLocalSkin, deleteLocalSkin, getActiveSkinId } from "../../game/skin-loader.js";
import { loadOsk } from "../../game/skin-loader.js";
export default {
  setup() {
    const skins = ref([]);
    const localSkins = ref([]);
    const activeId = ref(null);
    const status = ref("");
    const localStatus = ref("");
    async function load() { try { skins.value = await api.skins(); } catch { skins.value = []; } }
    async function loadLocal() {
      try {
        localSkins.value = await listLocalSkins();
        activeId.value = await getActiveSkinId();
        // also check single active cache (legacy) — if no vault but has cached skin, show it
        if (!localSkins.value.length) {
          try {
            const { loadCachedSkin } = await import("../../game/skin-loader.js");
            const cached = await loadCachedSkin();
            if (cached && cached.config) {
              localSkins.value = [{ id: "active", name: cached.config.name || "Active skin", author: cached.config.author || "", texCount: Object.keys(cached.textures||{}).length, sndCount: Object.keys(cached.sounds||{}).length, updated: Date.now(), _isActiveCache: true }];
              activeId.value = "active";
            }
          } catch {}
        }
      } catch { localSkins.value = []; }
    }
    async function upload(e) {
      const f = e.target.files[0];
      if (!f) return;
      if (!api.isLoggedIn()) { status.value = "Log in to share skins."; return; }
      status.value = "Uploading " + f.name + "...";
      try {
        const ab = await f.arrayBuffer();
        const r = await api.uploadSkin(f.name.replace(/\.osk$|\.zip$/i, ""), f.name, ab);
        status.value = "Shared as #" + r.id + "!"; load();
      } catch (e) { status.value = "Upload failed: " + (e.message || e); }
    }
    async function importLocal(e) {
      const f = e.target.files[0];
      if (!f) return;
      localStatus.value = "Importing " + f.name + "...";
      try {
        const data = await loadOsk(f);
        const meta = await saveLocalSkin(data, f.name);
        localStatus.value = `Imported "${meta.name}" — ${meta.texCount} textures. Applied for next game.`;
        await loadLocal();
      } catch (e) { localStatus.value = "Import failed: " + (e.message || e); }
      e.target.value = "";
    }
    async function applyLocal(id) {
       localStatus.value = "Applying...";
       try {
          const data = await loadLocalSkin(id);
          if (data) {
             // apply immediately if Skin already loaded, otherwise it will apply on next game via cache
             try {
                const { applySkin } = await import("../../game/skin-loader.js");
                if (window.Skin) { await applySkin(data); localStatus.value = "Applied! Skin is now active."; }
                else localStatus.value = "Will apply on next game start.";
             } catch (e) { localStatus.value = "Apply warning: " + (e.message || e); }
             activeId.value = id;
          } else localStatus.value = "Apply failed — skin data not found";
       } catch (e) { localStatus.value = "Apply failed: " + (e.message || e); }
    }
    async function removeLocal(id) {
      if (!confirm("Delete this local skin?")) return;
      await deleteLocalSkin(id);
      localStatus.value = "Deleted.";
      await loadLocal();
    }
    async function resetDefault() {
       try {
          await clearCachedSkin();
          try { localStorage.removeItem("webosu_active_skin"); } catch {}
          if (window.localforage) await new Promise(r => localforage.removeItem("skinTextures", () => r()));
          localStatus.value = "Reset to default skin (reowoTuna). Reloading...";
          setTimeout(() => location.reload(), 800);
       } catch (e) { localStatus.value = "Reset failed: " + (e.message || e); }
    }
    onMounted(() => { load(); loadLocal(); });
    return { skins, localSkins, activeId, status, localStatus, upload, importLocal, applyLocal, removeLocal, resetDefault, api };
  },
  template: `
    <div class="max-w-[1400px] mx-auto px-4 pt-4">
      <h2 class="text-xl font-bold text-white mb-3">Skins</h2>
      <p class="text-lazer-dim text-sm mb-3">Default skin: <b>reowoTuna</b> — loaded automatically on first visit and cached for instant startup. Import .osk files to switch skins.</p>

      <!-- Local vault -->
      <div class="bg-lazer-panel border border-white/8 rounded-xl p-4 mb-4">
        <div class="flex items-center justify-between mb-2">
          <h3 class="font-bold text-lazer-text">Your skins (local)</h3>
          <span class="text-xs text-lazer-dim">{{ localSkins.length }} stored</span>
        </div>
        <div class="flex gap-2 items-center mb-3 flex-wrap">
          <label class="bg-lazer-pink text-white rounded-lg px-3 py-1.5 text-sm cursor-pointer hover:brightness-110">Import .osk
            <input type="file" accept=".osk,.zip" @change="importLocal" class="hidden" />
          </label>
          <button @click="resetDefault" class="bg-lazer-panel2 border border-white/10 text-lazer-text rounded-lg px-3 py-1.5 text-sm hover:bg-white/10">Reset to default (reowoTuna)</button>
        </div>
        <div class="text-sm mb-2" :class="localStatus.includes('failed') ? 'text-red-400' : 'text-lazer-dim'">{{ localStatus }}</div>
        <div v-if="localSkins.length" class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));">
          <div v-for="s in localSkins" :key="s.id" class="bg-[#1e1e2e] border rounded-xl p-3" :class="s.id===activeId ? 'border-lazer-pink/50 ring-1 ring-lazer-pink/20' : 'border-white/5'">
            <div class="font-bold text-lazer-text truncate">{{ s.name }}</div>
            <div class="text-xs text-lazer-dim truncate">by {{ s.author || '?' }} • {{ s.texCount }} tex • {{ s.sndCount }} snd</div>
            <div class="text-xs text-lazer-dim">{{ new Date(s.updated).toLocaleString() }}</div>
            <div class="flex gap-2 mt-2">
              <button @click="applyLocal(s.id)" :disabled="s.id===activeId" class="flex-1 text-xs rounded-full px-2 py-1 border" :class="s.id===activeId ? 'bg-lazer-pink/20 border-lazer-pink/30 text-lazer-pink' : 'bg-white/5 border-white/10 text-lazer-text hover:bg-white/10'">{{ s.id===activeId ? 'Active ✓' : 'Apply' }}</button>
              <button @click="removeLocal(s.id)" class="text-xs rounded-full px-2 py-1 bg-white/5 border border-white/10 text-lazer-dim hover:text-red-400">Delete</button>
            </div>
            <div v-if="s.id===activeId" class="text-[11px] text-lazer-pink mt-1">Loaded on next game start only</div>
          </div>
        </div>
        <div v-else class="text-sm text-lazer-dim">No local skins yet — import an .osk above. Only the selected skin is loaded at game start for best performance.</div>
      </div>

      <!-- Remote shared -->
      <h3 class="font-bold text-white mb-2">Shared skins (online)</h3>
      <p class="text-lazer-dim text-sm mb-2">Share your .osk and apply others'. Downloads are cached locally when you import.</p>
      <div class="flex gap-2 items-center mb-2 flex-wrap">
        <label class="text-sm text-lazer-dim">Share: <input type="file" accept=".osk,.zip" @change="upload" class="ml-2" /></label>
      </div>
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
};
