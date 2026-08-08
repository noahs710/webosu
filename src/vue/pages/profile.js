import { ref, onMounted } from "vue";
import ProfileCard from "../components/ProfileCard.vue";
export default {
  components: { ProfileCard },
  setup() {
    const username = ref("");
    onMounted(() => {
      username.value = new URLSearchParams(location.search).get("u") || localStorage.getItem("username") || "";
    });
    return { username };
  },
  template: `
    <div class="max-w-[1400px] mx-auto px-4 pt-4">
      <h2 class="text-xl font-bold text-white mb-3">Profile</h2>
      <ProfileCard :username="username" />
    </div>
  `
};
