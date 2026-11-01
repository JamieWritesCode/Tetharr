<script setup lang="ts">
/**
 * The movie library: every movie from every Radarr, showing whether its file streams from the mount or is local, and
 * what the worker is doing to it. Each poster has a pin button: pinning keeps a local copy, unpinning frees up the
 * space and streams it again. Filters along the top narrow the list down, and the search box finds titles.
 */

import { PhMagnifyingGlass, PhPlugs } from "@phosphor-icons/vue";
import { useQueryClient } from "@tanstack/vue-query";
import { computed, ref, watch } from "vue";
import EmptyStateComponent from "../components/empty-state.vue";
import OrphansComponent from "../components/orphans.vue";
import PageHeaderComponent from "../components/page-header.vue";
import PosterCardComponent from "../components/poster-card.vue";
import ProblemsComponent from "../components/problems.vue";
import StateBadgeComponent from "../components/state-badge.vue";
import { size } from "../format.ts";
import * as ActivityService from "../services/activity.ts";
import * as ConfirmService from "../services/confirm.ts";
import * as MoviesService from "../services/movies.ts";
import * as SettingsService from "../services/settings.ts";

const { data, isPending, error } = MoviesService.useList();
const { data: activity } = ActivityService.useStatus();
const { mutate: pin, error: pinError } = MoviesService.usePin();
const { data: options } = SettingsService.useOptions();
const cache = useQueryClient();
const search = ref("");
const filter = ref("all");

type Movie = NonNullable<typeof data.value>["movies"][number];

// The filters. "Needs attention" gathers the states that mean something is wrong
const FILTERS: { key: string; label: string; test: (m: Movie) => boolean }[] = [
  { key: "all", label: "All", test: () => true },
  { key: "pinned", label: "Pinned", test: (m) => m.pinned },
  { key: "streamed", label: "Streamed", test: (m) => m.state === "streamed" },
  { key: "local", label: "Local", test: (m) => m.state === "local" },
  { key: "attention", label: "Needs attention", test: (m) => m.state === "broken" || m.state === "unseen" },
  { key: "none", label: "No file", test: (m) => m.state === "none" },
];

// Refresh the library whenever the worker starts or finishes something, so the labels catch up straight away
watch(
  () => [activity.value?.current?.media, activity.value?.last],
  () => cache.invalidateQueries({ queryKey: ["movies"] }),
);

// How many movies each filter would show, for the counts on the filter buttons
const counts = computed(() =>
  Object.fromEntries(FILTERS.map((f) => [f.key, (data.value?.movies ?? []).filter(f.test).length])),
);

// The movies in the chosen filter whose title matches the search
const movies = computed(() => {
  const test = FILTERS.find((f) => f.key === filter.value)!.test;
  const term = search.value.trim().toLowerCase();
  return (data.value?.movies ?? []).filter((m) => test(m) && m.title.toLowerCase().includes(term));
});

/**
 * The label for a movie's card: what the worker is doing to it right now, whether it's waiting for the worker, or else
 * where its file lives.
 */
function badge(movie: Movie) {
  const current = activity.value?.current;
  if (current?.arr === movie.arr && current.media === movie.id) {
    const progress = current.progress;
    return {
      state: current.action,
      detail: progress?.size ? `${Math.floor((progress.done / progress.size) * 100)}%` : undefined,
    };
  }
  if ((movie.pinned && movie.state === "streamed") || (!movie.pinned && movie.managed))
    return { state: "queued" as const };
  if (movie.state === "local" && !movie.managed) return { state: "unmanaged" as const };
  return { state: movie.state };
}

/**
 * Whether a movie can be pinned or unpinned. A movie with no file has nothing to copy, and a local file Tetharr didn't
 * create can never be unpinned, so neither gets a pin button (unless it's already pinned, so it can be unpinned).
 */
const pinnable = (movie: Movie) =>
  movie.pinned || (movie.state !== "none" && !(movie.state === "local" && !movie.managed));

/**
 * Pins or unpins a movie. Unpinning that will delete the copy and leave the movie missing until Radarr downloads it
 * again asks first. Unpinning that just puts the link back is instant and harmless, so it doesn't.
 */
async function toggle(movie: Movie) {
  if (movie.pinned && movie.managed && (options.value?.unpin === "regrab" || !movie.restorable)) {
    const choice = await ConfirmService.ask({
      title: `Unpin ${movie.title}?`,
      summary:
        options.value?.unpin === "regrab"
          ? "Unpinning is set to always re-grab."
          : "Its streamed file is gone, so the link can't simply be put back.",
      steps: [`Delete Tetharr's local copy (${size(movie.size)})`, "Ask Radarr to download it again"],
      consequences: [
        { tone: "warning", text: `${movie.title} will be missing until Radarr finishes downloading it.` },
        { tone: "success", text: `${size(movie.size)} of local space is freed.` },
      ],
      choices: [{ value: "unpin", label: "Unpin and re-grab", tone: "error" }],
    });
    if (!choice) return;
  }
  pin({ arr: movie.arr, id: movie.id, pinned: !movie.pinned });
}
</script>

<template>
  <PageHeaderComponent title="Movies" :detail="data ? `${data.movies.length} movies across your Radarrs` : undefined">
    <label class="input w-full sm:w-64">
      <PhMagnifyingGlass class="size-4 opacity-50" />
      <input v-model="search" type="search" placeholder="Search titles" />
    </label>
  </PageHeaderComponent>

  <!-- A Radarr that can't be reached has its movies missing from the list, not gone -->
  <ProblemsComponent :errors="[...(data?.errors ?? []), error?.message, pinError?.message]" />

  <OrphansComponent v-if="data" :orphans="data.orphans" kind="movies" class="mb-5" />

  <div v-if="isPending" class="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-4">
    <div v-for="i in 12" :key="i" class="card overflow-hidden bg-base-100 card-border">
      <div class="aspect-2/3 skeleton rounded-none" />
      <div class="card-body gap-2 p-3">
        <div class="h-4 w-3/4 skeleton" />
        <div class="h-3 w-1/2 skeleton" />
      </div>
    </div>
  </div>

  <EmptyStateComponent
    v-else-if="data && !data.movies.length && !data.errors.length"
    :icon="PhPlugs"
    title="No movies yet"
  >
    Connect a Radarr and its movies will show up here.
    <RouterLink to="/settings" class="btn btn-primary btn-sm">Go to settings</RouterLink>
  </EmptyStateComponent>

  <template v-else-if="data?.movies.length">
    <div class="mb-5 flex gap-1 overflow-x-auto pb-1">
      <button
        v-for="f in FILTERS"
        :key="f.key"
        type="button"
        class="btn shrink-0 gap-2 btn-sm"
        :class="filter === f.key ? 'btn-primary' : 'btn-ghost'"
        @click="filter = f.key"
      >
        {{ f.label }}
        <span class="font-mono text-xs opacity-70">{{ counts[f.key] }}</span>
      </button>
    </div>

    <EmptyStateComponent v-if="!movies.length" :icon="PhMagnifyingGlass" title="Nothing matches">
      Try a different search or filter.
    </EmptyStateComponent>

    <ul v-else class="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-4">
      <PosterCardComponent
        v-for="movie in movies"
        :key="`${movie.arr}-${movie.id}`"
        :title="movie.title"
        :poster="movie.poster"
        :details="movie.size ? `${movie.year} · ${size(movie.size)}` : String(movie.year)"
        :pinned="movie.pinned"
        :pinnable="pinnable(movie)"
        @pin="toggle(movie)"
      >
        <StateBadgeComponent v-bind="badge(movie)" :path="movie.path" />
      </PosterCardComponent>
    </ul>
  </template>
</template>
