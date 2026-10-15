/**
 * The pages of the web interface, and the address each one lives at. A series' own page sits under /series, so the
 * Series link stays highlighted while it's open.
 */

import { createRouter, createWebHistory } from "vue-router";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/movies" },
    { path: "/movies", component: () => import("./views/movies.vue") },
    {
      path: "/series",
      children: [
        { path: "", component: () => import("./views/series.vue") },
        { path: ":arr/:id", component: () => import("./views/show.vue") },
      ],
    },
    { path: "/settings", component: () => import("./views/settings.vue") },
  ],
});
