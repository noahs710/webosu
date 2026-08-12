<script setup>
import { ref, onMounted } from "vue";
import { api } from "../../shell/api.js";
import { syncFavoritesOnLogin } from "../../shell/favorites.js";
const searchQuery = ref("");
const user = ref(null);
const showLogin = ref(false);
const username = ref("");
const password = ref("");
const err = ref("");

const emit = defineEmits(["toggle-mods"]);
async function checkLogin() {
  try {
    if (!api.isLoggedIn()) return;
    user.value = await api.me();
  } catch {}
}
function openLogin() { showLogin.value = true; err.value = ""; }
function close() { showLogin.value = false; }
async function doLogin() {
  err.value = "";
  try {
    user.value = await api.login(username.value, password.value);
    showLogin.value = false;
    syncFavoritesOnLogin(); // fire-and-forget merge
  } catch (e) { err.value = "Login failed"; }
}
async function doRegister() {
  err.value = "";
  try {
    user.value = await api.register(username.value, password.value);
    showLogin.value = false;
    syncFavoritesOnLogin(); // fire-and-forget merge
  } catch (e) { err.value = "Registration failed"; }
}
function logout() { api.logout(); user.value = null; }
onMounted(checkLogin);
</script>

<template>
  <div id="nav-root">
    <nav id="main-nav" class="flex items-center justify-between max-w-[1400px] mx-auto h-[50px] px-4 box-border"
       style="background: linear-gradient(180deg,#1c1c28,#14141e); border-bottom: 1px solid rgba(255,255,255,0.06); box-shadow: 0 2px 14px rgba(0,0,0,0.4);">
    <div class="flex items-center gap-1 flex-shrink-0">
      <router-link to="/" class="text-lazer-pink font-extrabold px-3 py-2" active-class="">webosu!</router-link>
      <router-link v-for="link in [
        { to: '/browse', label: 'Browse' },
      ]" :key="link.to" :to="link.to"
        active-class="bg-lazer-pink/16 text-white"
        class="px-3.5 rounded-full h-9 leading-9 transition-all text-sm text-lazer-text hover:bg-lazer-pink/16">
        {{ link.label }}
      </router-link>
      <button @click="emit('toggle-mods')" title="Mods (F1)"
        class="px-3.5 rounded-full h-9 leading-9 transition-all text-sm text-lazer-text hover:bg-lazer-pink/16 bg-white/5">
        Mods
      </button>
    </div>
    <form @submit.prevent="$router.push('/search?q=' + encodeURIComponent(searchQuery))" class="flex-1 max-w-[480px] mx-4">
      <input v-model="searchQuery" type="text" placeholder="Search for a beatmap or enter a Set ID"
        class="w-full bg-lazer-panel2 border border-white/8 rounded-full px-4 py-2 text-lazer-text text-sm focus:border-lazer-pink focus:outline-none" />
    </form>
    <div class="flex items-center gap-1 flex-shrink-0">
      <router-link to="/skins" active-class="bg-lazer-pink/16 text-white"
        class="px-3.5 rounded-full h-9 leading-9 text-sm transition-all text-lazer-text hover:bg-lazer-pink/16">Skins</router-link>
      <router-link to="/liked" active-class="bg-lazer-pink/16 text-white"
        class="px-3.5 rounded-full h-9 leading-9 text-sm transition-all text-lazer-text hover:bg-lazer-pink/16">Favorites</router-link>
      <router-link to="/settings" active-class="bg-lazer-pink/16 text-white"
        class="px-3.5 rounded-full h-9 leading-9 text-sm transition-all text-lazer-text hover:bg-lazer-pink/16">Settings</router-link>
      <button v-if="!user" @click="openLogin"
        class="bg-lazer-pink text-white px-4 py-1.5 rounded-lg text-sm ml-2 hover:brightness-110 transition-all">Log in</button>
      <span v-else class="flex items-center gap-1.5 ml-2">
        <div class="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center bg-lazer-panel2 border border-lazer-pink/30 shrink-0">
          <img v-if="user.pfp_url" :src="user.pfp_url" :alt="user.username" class="w-full h-full object-cover"
               @error="$event.target.style.display='none'; $event.target.nextElementSibling.style.display='flex'" />
          <div v-if="!user.pfp_url" class="w-full h-full flex items-center justify-center text-xs font-bold text-lazer-pink">{{ (user.username || '?').charAt(0).toUpperCase() }}</div>
          <div v-else class="w-full h-full flex items-center justify-center text-xs font-bold text-lazer-pink" style="display:none">{{ (user.username || '?').charAt(0).toUpperCase() }}</div>
        </div>
        <span class="text-sm text-lazer-dim">{{ user.username }}</span>
        <button @click="logout" class="text-lazer-text border border-white/12 px-2 py-0.5 rounded hover:bg-white/5">Log out</button>
      </span>
    </div>
  </nav>

  <div v-if="showLogin" @click.self="close"
    class="fixed inset-0 z-[100] flex items-center justify-center" style="background: rgba(0,0,0,0.6);">
    <div class="bg-lazer-panel border border-white/10 rounded-xl p-6 w-80 shadow-2xl">
      <div class="flex justify-between items-center mb-4">
        <span class="text-lazer-pink font-bold text-lg">Log in</span>
        <button @click="close" class="text-lazer-dim hover:text-white">x</button>
      </div>
      <div v-if="err" class="text-red-400 text-sm mb-2">{{ err }}</div>
      <input v-model="username" placeholder="username" maxlength="20"
        class="block w-full bg-lazer-bg border border-white/10 rounded-lg px-3 py-2 mb-2 text-lazer-text focus:border-lazer-pink focus:outline-none" />
      <input v-model="password" type="password" placeholder="password"
        @keydown.enter="doLogin"
        class="block w-full bg-lazer-bg border border-white/10 rounded-lg px-3 py-2 mb-3 text-lazer-text focus:border-lazer-pink focus:outline-none" />
      <div class="flex gap-2">
        <button @click="doLogin" class="flex-1 bg-lazer-pink text-white rounded-lg py-2 text-sm hover:brightness-110">Log in</button>
        <button @click="doRegister" class="flex-1 border border-white/12 text-lazer-text rounded-lg py-2 text-sm hover:bg-white/5">Register</button>
      </div>
    </div>
  </div>
  </div>
</template>
