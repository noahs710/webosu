import { createRouter, createWebHistory } from "vue-router";

const routes = [
  { path: "/", name: "home", component: () => import("./pages/Home.js") },
  { path: "/browse", name: "browse", component: () => import("./pages/Browse.js") },
  { path: "/hot", name: "hot", component: () => import("./pages/Hot.js") },
  { path: "/new", name: "new", component: () => import("./pages/New.js") },
  { path: "/search", name: "search", component: () => import("./pages/Search.js") },
  { path: "/leaderboard", name: "leaderboard", component: () => import("./pages/Leaderboard.js") },
  { path: "/profile", name: "profile", component: () => import("./pages/Profile.js") },
  { path: "/settings", name: "settings", component: () => import("./pages/Settings.js") },
  { path: "/skins", name: "skins", component: () => import("./pages/Skins.js") },
  { path: "/liked", name: "liked", component: () => import("./pages/Liked.js") },
  { path: "/history", name: "history", component: () => import("./pages/History.js") },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});
