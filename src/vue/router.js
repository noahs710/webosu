import { createRouter, createWebHistory } from "vue-router";

const routes = [
  { path: "/", name: "home", component: () => import("./pages/home.js") },
  { path: "/browse", name: "browse", component: () => import("./pages/browse.js") },
  { path: "/hot", name: "hot", component: () => import("./pages/hot.js") },
  { path: "/new", name: "new", component: () => import("./pages/new.js") },
  { path: "/search", name: "search", component: () => import("./pages/search.js") },
  { path: "/leaderboard", name: "leaderboard", component: () => import("./pages/leaderboard.js") },
  { path: "/u/:username", name: "profile", component: () => import("./pages/profile.js") },
  { path: "/profile", redirect: (to) => {
    const u = to.query.u || localStorage.getItem("username") || "";
    return u ? `/u/${encodeURIComponent(u)}` : "/u/";
  }},
  { path: "/settings", name: "settings", component: () => import("./pages/settings.js") },
  { path: "/skins", name: "skins", component: () => import("./pages/skins.js") },
  { path: "/liked", name: "liked", component: () => import("./pages/liked.js") },
  { path: "/history", name: "history", component: () => import("./pages/history.js") },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});
