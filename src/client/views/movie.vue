<script setup lang="ts">
/**
 * One movie's own page: its details and pin button, then its file, with what that file is right now, where Tetharr sees
 * it, and, when something needs attention, what it means and what to check.
 */

import { PhArrowLeft, PhFilmSlate, PhPushPin } from "@phosphor-icons/vue";
import { useQueryClient } from "@tanstack/vue-query";
import { computed, watch } from "vue";
import { useRoute } from "vue-router";
import ProblemsComponent from "../components/problems.vue";
import SectionCardComponent from "../components/section-card.vue";
import StateBadgeComponent from "../components/state-badge.vue";
import { size } from "../format.ts";
import * as ActivityService from "../services/activity.ts";
import * as MoviesService from "../services/movies.ts";

const route = useRoute();
const arr = computed(() => Number(route.params.arr));
const id = computed(() => Number(route.params.id));
const { data: movie, isPending, error } = MoviesService.useOne(arr, id);
const { data: activity } = ActivityService.useStatus();
const { toggle, error: pinError } = MoviesService.useToggle();
const { badge } = MoviesService.useBadge();
const cache = useQueryClient();

// Refresh the movie whenever the worker starts or finishes something, so the label catches up straight away
watch(
  () => [activity.value?.current?.media, activity.value?.last],
  () => cache.invalidateQueries({ queryKey: ["movies"] }),
);

// What a file that isn't simply streamed or local means, and what to check
const NOTES: Partial<Record<string, string>> = {
  broken: "Tetharr can't follow this link. Check that the mount is up inside Tetharr.",
  unseen: "Tetharr can't see this file. Check the connection's path mappings in Settings.",
  unmanaged: "Tetharr didn't make this file, so it never touches it.",
  none: "Radarr has no file for this movie yet.",
};
const note = computed(() => movie.value && NOTES[badge(movie.value).state]);
</script>

<template>
  <RouterLink to="/movies" class="btn mb-4 btn-ghost btn-sm"><PhArrowLeft class="size-4" />Movies</RouterLink>

  <ProblemsComponent :errors="[error?.message, pinError?.message]" />

  <div v-if="isPending" class="flex flex-col gap-6">
    <div class="h-48 w-full skeleton" />
    <div class="h-24 w-full skeleton" />
  </div>

  <div v-else-if="movie" class="flex flex-col gap-6">
    <section class="card bg-base-100 card-border">
      <div class="card-body flex-row gap-5 p-5">
        <div class="hidden w-28 shrink-0 overflow-hidden rounded-field bg-base-300 sm:block">
          <img v-if="movie.poster" :src="movie.poster" :alt="movie.title" class="aspect-2/3 w-full object-cover" />
          <PhFilmSlate v-else class="m-auto size-10 text-base-content/30" />
        </div>
        <div class="flex min-w-0 flex-1 flex-col gap-2">
          <h1 class="text-2xl font-bold tracking-tight">{{ movie.title }}</h1>
          <p class="font-mono text-xs text-base-content/60">
            {{ movie.year }}<template v-if="movie.size"> · {{ size(movie.size) }}</template>
          </p>
          <p class="line-clamp-3 max-w-prose text-sm text-base-content/70">{{ movie.overview }}</p>
          <div v-if="MoviesService.pinnable(movie)" class="mt-auto pt-2">
            <button
              type="button"
              class="btn btn-sm"
              :class="movie.pinned ? 'btn-primary' : ''"
              :aria-pressed="movie.pinned"
              :title="movie.pinned ? 'Unpin and stream it again' : 'Keep a local copy'"
              @click="toggle(movie)"
            >
              <PhPushPin :weight="movie.pinned ? 'fill' : 'bold'" class="size-4" />
              {{ movie.pinned ? "Pinned" : "Pin movie" }}
            </button>
          </div>
        </div>
      </div>
    </section>

    <SectionCardComponent title="File">
      <div class="flex flex-col gap-1.5 px-5 py-4">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="min-w-0 truncate font-mono text-xs" :title="movie.path">
            {{ movie.path?.split("/").at(-1) ?? "No file" }}
          </span>
          <StateBadgeComponent v-bind="badge(movie)" :path="movie.path" />
        </div>
        <p v-if="movie.path" class="font-mono text-xs break-all text-base-content/60">
          {{ movie.path }}<template v-if="movie.size"> · {{ size(movie.size) }}</template>
        </p>
        <p v-if="note" class="text-sm text-base-content/70">{{ note }}</p>
      </div>
    </SectionCardComponent>
  </div>
</template>
