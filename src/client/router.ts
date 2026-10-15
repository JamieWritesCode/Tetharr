/**
 * The pages of the web interface, and the address each one lives at.
 */

import { createRouter, createWebHistory } from "vue-router";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/movies" },
    { path: "/movies", component: () => import("./views/movies.vue") },
    { path: "/settings", component: () => import("./views/settings.vue") },
  ],
});
