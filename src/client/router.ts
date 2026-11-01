/**
 * The pages of the web interface, and the address each one lives at. A movie's or series' own page sits under /movies
 * or /series, so the matching link stays highlighted while it's open.
 */

import { createRouter, createWebHistory } from "vue-router";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/movies" },
    {
      path: "/movies",
      children: [
        { path: "", component: () => import("./views/movies.vue") },
        { path: ":arr/:id", component: () => import("./views/movie.vue") },
      ],
    },
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
