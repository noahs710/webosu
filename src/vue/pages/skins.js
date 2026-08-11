import { ref, onMounted } from "vue";
import { api } from "../../shell/api.js";
import { clearCachedSkin, listLocalSkins, saveLocalSkin, loadLocalSkin, deleteLocalSkin, getActiveSkinId, getCachedSkinMeta, unloadActiveSkin, applySkin } from "../../game/skin-loader.js";
import { loadOsk } from "../../game/skin-loader.js";
export default {
  setup() {
    const skins = ref([]);
    const localSkins = ref([]);
    const activeId = ref(null);
    const status = ref("");
    const localStatus = ref("");
    const uploadQueue = ref([]);
    async function load() { try { skins.value = await api.skins(); } catch { skins.value = []; } }
    async function loadLocal() {
      try {
        localSkins.value = await listLocalSkins();
        activeId.value = await getActiveSkinId();
        // also check single active cache (legacy) — use getCachedSkinMeta to avoid creating blob URLs
        if (!localSkins.value.length) {
          try {
            const meta = await getCachedSkinMeta();
            if (meta) {
              localSkins.value = [{ id: "active", name: meta.name || "Active skin", author: meta.author || "", texCount: 0, sndCount: 0, updated: Date.now(), _isActiveCache: true }];
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
      const files = Array.from(e.target.files);
      if (!files.length) return;
      // Queue multiple files, process sequentially
      for (const f of files) {
        uploadQueue.value.push({ name: f.name, status: "pending" });
      }
      e.target.value = "";
      // Process queue one at a time
      for (let i = 0; i < files.length; i++) {
        const qi = uploadQueue.value.findIndex(q => q.name === files[i].name && q.status === "pending");
        if (qi < 0) continue;
        uploadQueue.value[qi].status = "importing";
        localStatus.value = "Importing " + files[i].name + "...";
        try {
          const data = await loadOsk(files[i]);
          const meta = await saveLocalSkin(data, files[i].name);
          uploadQueue.value[qi].status = "done";
          uploadQueue.value[qi].name = meta.name || files[i].name;
          localStatus.value = `Imported "${meta.name}" — ${meta.texCount} textures. Click Apply to switch.`;
          await loadLocal();
        } catch (err) {
          uploadQueue.value[qi].status = "failed";
          localStatus.value = "Import failed: " + (err.message || err);
        }
        // Yield to UI thread between files (prevent freeze on old Chromebooks)
        await new Promise(r => setTimeout(r, 0));
      }
      // Clean up completed items after a delay
      setTimeout(() => { uploadQueue.value = uploadQueue.value.filter(q => q.status !== "done"); }, 3000);
    }
    async function applyLocal(id) {
       localStatus.value = "Applying...";
       try {
          const data = await loadLocalSkin(id);
          if (data) {
             // mid-game guard: can't safely swap textures while gameplay sprites hold old refs
             if (window.playback && !window.playback.ended) {
                localStatus.value = "Skin cached — will apply on next game (can't swap mid-play).";
                activeId.value = id;
                return;
             }
             // safe to apply immediately (no game running) — unload old skin first
             try {
                if (window.Skin) { await unloadActiveSkin(); await applySkin(data); localStatus.value = "Applied! Skin is now active."; }
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
    return { skins, localSkins, activeId, status, localStatus, uploadQueue, upload, importLocal, applyLocal, removeLocal, resetDefault, api };
  },
  template: `
    <div class="max-w-[1400px] mx-auto px-4 pt-4">
      <h2 class="text-xl font-bold text-white mb-3">Skins</h2>
      <p class="text-lazer-dim text-sm mb-3">Default skin: <b>reowoTuna</b> — loaded automatically on first visit and cached for instant startup. Import .osk files to switch skins.</p>

      <!-- Discord banner -->
      <div class="bg-gradient-to-r from-[#5865F2]/20 to-[#5865F2]/5 border border-[#5865F2]/30 rounded-xl p-4 mb-4 flex items-center gap-4">
        <div class="text-3xl">💬</div>
        <div class="flex-1">
          <div class="font-bold text-white">Join the webosu Discord!</div>
          <div class="text-sm text-lazer-dim">Share scores, skins, and chat with the community.</div>
        </div>
        <a href="https://discord.gg/v7wBtSdYzx" target="_blank" class="bg-[#5865F2] text-white px-4 py-2 rounded-lg text-sm font-bold hover:brightness-110 transition whitespace-nowrap">Join Discord</a>
      </div>

      <!-- Local vault -->
      <div class="bg-lazer-panel border border-white/8 rounded-xl p-4 mb-4">
        <div class="flex items-center justify-between mb-2">
          <h3 class="font-bold text-lazer-text">Your skins (local)</h3>
          <span class="text-xs text-lazer-dim">{{ localSkins.length }} stored</span>
        </div>
        <div class="flex gap-2 items-center mb-3 flex-wrap">
          <label class="bg-lazer-pink text-white rounded-lg px-3 py-1.5 text-sm cursor-pointer hover:brightness-110">Import .osk
            <input type="file" accept=".osk,.zip" multiple @change="importLocal" class="hidden" />
          </label>
          <button @click="resetDefault" class="bg-lazer-panel2 border border-white/10 text-lazer-text rounded-lg px-3 py-1.5 text-sm hover:bg-white/10">Reset to default (reowoTuna)</button>
        </div>
        <div class="text-sm mb-2" :class="localStatus.includes('failed') ? 'text-red-400' : 'text-lazer-dim'">{{ localStatus }}</div>
        <div v-if="uploadQueue.length" class="mb-3 space-y-1">
          <div v-for="(q, i) in uploadQueue" :key="i" class="text-xs flex items-center gap-2 bg-lazer-panel2 rounded-lg px-3 py-1.5">
            <span>{{ q.status === 'importing' ? '⏳' : q.status === 'done' ? '✓' : q.status === 'failed' ? '✗' : '⏸' }}</span>
            <span class="flex-1 truncate">{{ q.name }}</span>
            <span class="text-lazer-dim">{{ q.status }}</span>
          </div>
        </div>
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
    </div>
  `
};
