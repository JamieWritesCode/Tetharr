<script setup lang="ts">
/**
 * The movie library: every movie from every Radarr, showing whether its file streams from the mount or is local, and
 * what the worker is doing to it. Each poster has a pin button: pinning keeps a local copy, unpinning frees up the
 * space and streams it again. Each card opens the movie's own page. Filters along the top narrow the list down, and the
 * search box finds titles.
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
import * as MoviesService from "../services/movies.ts";

const { data, isPending, error } = MoviesService.useList();
const { data: activity } = ActivityService.useStatus();
const { toggle, error: pinError } = MoviesService.useToggle();
const { badge } = MoviesService.useBadge();
const cache = useQueryClient();
const search = ref("");
const filter = ref("all");

type Movie = MoviesService.Movie;

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
        :pinnable="MoviesService.pinnable(movie)"
        :to="`/movies/${movie.arr}/${movie.id}`"
        @pin="toggle(movie)"
      >
        <StateBadgeComponent v-bind="badge(movie)" :path="movie.path" />
      </PosterCardComponent>
    </ul>
  </template>
</template>
