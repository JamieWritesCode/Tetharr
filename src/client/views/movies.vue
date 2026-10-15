<script setup lang="ts">
/**
 * The movie library: every movie from every Radarr, showing whether its file streams from usenet or is local, and what
 * the worker is doing to it. Each poster has a pin button: pinning keeps a local copy, unpinning frees up the space and
 * streams it again. Filters along the top narrow the list down, and the search box finds titles.
 */

import {
  PhCheck,
  PhFilmSlate,
  PhMagnifyingGlass,
  PhPlugs,
  PhPushPin,
  PhTrash,
  PhWarningCircle,
} from "@phosphor-icons/vue";
import { useQueryClient } from "@tanstack/vue-query";
import { computed, onUnmounted, ref, watch } from "vue";
import EmptyStateComponent from "../components/empty-state.vue";
import PageHeaderComponent from "../components/page-header.vue";
import SectionCardComponent from "../components/section-card.vue";
import StateBadgeComponent from "../components/state-badge.vue";
import { size } from "../format.ts";
import * as ActivityService from "../services/activity.ts";
import * as ConfirmService from "../services/confirm.ts";
import * as CopiesService from "../services/copies.ts";
import * as MoviesService from "../services/movies.ts";
import * as SettingsService from "../services/settings.ts";

const { data, isPending, error } = MoviesService.useList();
const { data: activity } = ActivityService.useStatus();
const { mutate: pin, error: pinError } = MoviesService.usePin();
const { mutate: resolve, error: resolveError } = CopiesService.useResolve();
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

// Problems the worker hit on its last pass, and problems loading the library just now that the worker didn't also hit
const worker = computed(() => activity.value?.errors ?? []);
const loading = computed(() => (data.value?.errors ?? []).filter((e) => !worker.value.includes(e)));

// The time now, updated every second, so the countdown to the worker's next try stays live
const now = ref(Date.now());
const tick = setInterval(() => (now.value = Date.now()), 1000);
onUnmounted(() => clearInterval(tick));

// When the worker will try again, counting down, so a passing problem is visibly about to be rechecked
const retry = computed(() => {
  const next = activity.value?.next;
  if (!next) return;
  const seconds = Math.max(0, Math.round((Date.parse(next) - now.value) / 1000));
  if (!seconds) return "Trying again now";
  return `Trying again in ${seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`}`;
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

/**
 * Keeps or deletes a copy of a movie Radarr no longer lists, after the user confirms what that means.
 */
async function settle(orphan: { arr: string; path: string; size: number }, action: "keep" | "delete") {
  const name = orphan.path.split("/").at(-2);
  const choice = await ConfirmService.ask(
    action === "keep"
      ? {
          title: `Keep ${name}?`,
          consequences: [
            { tone: "info", text: "The file stays where it is, as an unmanaged local file." },
            { tone: "info", text: "Tetharr forgets it, and will never change or delete it." },
          ],
          choices: [{ value: "keep", label: "Keep the file" }],
        }
      : {
          title: `Delete ${name}?`,
          steps: [`Delete Tetharr's copy (${size(orphan.size)})`],
          consequences: [
            { tone: "error", text: `${orphan.arr} no longer lists this movie, so nothing will download it again.` },
            { tone: "success", text: `${size(orphan.size)} of local space is freed.` },
          ],
          choices: [{ value: "delete", label: "Delete the copy", tone: "error" }],
        },
  );
  if (choice) resolve({ path: orphan.path, action });
}
</script>

<template>
  <PageHeaderComponent title="Movies" :detail="data ? `${data.movies.length} movies across your Radarrs` : undefined">
    <label class="input w-full sm:w-64">
      <PhMagnifyingGlass class="size-4 opacity-50" />
      <input v-model="search" type="search" placeholder="Search titles" />
    </label>
  </PageHeaderComponent>

  <!-- Problems from the Arrs and the worker. A Radarr that can't be reached has its movies missing, not gone -->
  <div class="mb-4 flex flex-col gap-2 empty:hidden">
    <!-- The countdown sits at the far right on larger screens, and under the message on phones -->
    <div
      v-for="message in worker"
      :key="message"
      role="alert"
      class="alert alert-soft alert-error max-sm:grid-flow-row max-sm:grid-cols-[auto_1fr]"
    >
      <PhWarningCircle class="size-5" />
      <span>{{ message }}</span>
      <span v-if="retry" class="text-xs whitespace-nowrap opacity-70 max-sm:col-start-2">{{ retry }}</span>
    </div>
    <div v-for="message in loading" :key="message" role="alert" class="alert alert-soft alert-error">
      <PhWarningCircle class="size-5" />{{ message }}
    </div>
    <div
      v-for="err in [error, pinError, resolveError].filter(Boolean)"
      :key="err!.message"
      role="alert"
      class="alert alert-soft alert-error"
    >
      <PhWarningCircle class="size-5" />{{ err!.message }}
    </div>
  </div>

  <!-- Copies of movies Radarr no longer lists. Tetharr leaves them alone until the user decides -->
  <SectionCardComponent
    v-if="data?.orphans.length"
    class="mb-5"
    title="Copies of movies no longer in Radarr"
    description="Tetharr made these copies, but the movies have since been removed from Radarr. Keep or delete each one."
  >
    <ul class="divide-y divide-base-300">
      <li v-for="orphan in data.orphans" :key="orphan.path" class="flex flex-wrap items-center gap-4 px-5 py-3">
        <div class="min-w-0 flex-1">
          <p class="truncate font-medium">{{ orphan.path.split("/").at(-2) }}</p>
          <p class="truncate font-mono text-xs text-base-content/60">{{ orphan.path }} · {{ size(orphan.size) }}</p>
        </div>
        <div class="flex gap-2">
          <button type="button" class="btn btn-ghost btn-sm" @click="settle(orphan, 'keep')">
            <PhCheck class="size-4" />Keep
          </button>
          <button type="button" class="btn btn-ghost text-error btn-sm" @click="settle(orphan, 'delete')">
            <PhTrash class="size-4" />Delete
          </button>
        </div>
      </li>
    </ul>
  </SectionCardComponent>

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
      <li
        v-for="movie in movies"
        :key="`${movie.arr}-${movie.id}`"
        class="group card overflow-hidden bg-base-100 transition-colors card-border hover:border-primary/50"
      >
        <figure class="relative grid aspect-2/3 place-items-center bg-base-300">
          <img
            v-if="movie.poster"
            :src="movie.poster"
            :alt="movie.title"
            loading="lazy"
            class="size-full object-cover"
          />
          <PhFilmSlate v-else class="size-10 text-base-content/30" />

          <!-- The pin button: always shown once pinned, otherwise on hover (and always on touch screens) -->
          <button
            v-if="pinnable(movie)"
            type="button"
            class="btn absolute top-2 right-2 btn-circle transition-opacity btn-sm"
            :class="
              movie.pinned
                ? 'btn-primary'
                : 'border-base-300 bg-base-100/90 backdrop-blur-sm group-hover:opacity-100 focus-visible:opacity-100 lg:opacity-0'
            "
            :aria-pressed="movie.pinned"
            :aria-label="movie.pinned ? `Unpin ${movie.title}` : `Pin ${movie.title}`"
            :title="movie.pinned ? 'Unpin: free up the space and stream it again' : 'Pin: keep a local copy'"
            @click="toggle(movie)"
          >
            <PhPushPin :weight="movie.pinned ? 'fill' : 'bold'" class="size-4" />
          </button>
        </figure>
        <div class="card-body gap-1.5 p-3">
          <h2 class="truncate text-sm font-semibold" :title="movie.title">{{ movie.title }}</h2>
          <p class="font-mono text-xs text-base-content/60">
            {{ movie.year }}<template v-if="movie.size"> · {{ size(movie.size) }}</template>
          </p>
          <StateBadgeComponent v-bind="badge(movie)" :path="movie.path" class="mt-1" />
        </div>
      </li>
    </ul>
  </template>
</template>
