import { ref, watch, onMounted } from "vue";
import { useRoute } from "vue-router";
import ProfileCard from "../components/ProfileCard.vue";
export default {
  components: { ProfileCard },
  setup() {
    const route = useRoute();
    const username = ref("");
    function loadFromRoute() {
      username.value = (route && route.params && route.params.username) || localStorage.getItem("username") || "";
    }
    onMounted(loadFromRoute);
    watch(() => route.params.username, loadFromRoute);
    return { username };
  },
  template: `
    <div class="max-w-[1400px] mx-auto px-4 pt-4">
      <h2 class="text-xl font-bold text-white mb-3">Profile</h2>
      <ProfileCard :username="username" />
    </div>
  `
};