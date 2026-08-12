import { ref, watch, onMounted } from "vue";
import { useRoute } from "vue-router";
import ProfileCard from "../components/ProfileCard.vue";
import { api } from "../../shell/api.js";
export default {
   components: { ProfileCard },
   setup() {
      const route = useRoute();
      const username = ref("");
      const isLoggedIn = ref(!!(api && api.isLoggedIn && api.isLoggedIn()));
      function loadFromRoute() {
         // Only honor the route-supplied username when the user is logged in
         // (anon browsing shouldn't expose account-bound profile data).
         if (api && api.isLoggedIn && api.isLoggedIn()) {
            username.value =
               (route && route.params && route.params.username) ||
               localStorage.getItem("username") ||
               "";
         } else {
            username.value = "";
         }
      }
      onMounted(loadFromRoute);
      watch(() => route.params.username, loadFromRoute);
      return { username, isLoggedIn };
   },
   template: `
    <div class="max-w-[1400px] mx-auto px-4 pt-4">
      <h2 class="text-xl font-bold text-white mb-3">Profile</h2>
      <ProfileCard v-if="isLoggedIn" :username="username" />
      <div v-else class="bg-lazer-panel border border-white/10 rounded-xl p-6 text-lazer-dim text-sm">
        Profile settings are only available to logged-in users. <a href="/login" class="text-lazer-pink">Log in</a> to view your profile.
      </div>
    </div>
  `,
};
