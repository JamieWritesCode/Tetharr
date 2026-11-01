<script setup lang="ts">
/**
 * The series library: every series from every Sonarr. Each poster's pin button pins the whole series, which covers
 * every season including episodes that arrive later. Each card opens the series' own page, where single seasons can be
 * pinned and every episode file's state is shown.
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
import * as ActivityService from "../services/activity.ts";
import * as ConfirmService from "../services/confirm.ts";
import * as SeriesService from "../services/series.ts";
import * as SettingsService from "../services/settings.ts";

const { data, isPending, error } = SeriesService.useList();
const { data: activity } = ActivityService.useStatus();
const { data: options } = SettingsService.useOptions();
const { mutate: pin, error: pinError } = SeriesService.usePin();
const cache = useQueryClient();
const search = ref("");
const filter = ref("all");

type Show = NonNullable<typeof data.value>["series"][number];

// The filters: everything, anything pinned (the series or some of its seasons), series whose files are all streamed,
// anything with local copies, series whose files Tetharr can't see, and series with no files yet
const FILTERS: { key: string; label: string; test: (s: Show) => boolean }[] = [
  { key: "all", label: "All", test: () => true },
  { key: "pinned", label: "Pinned", test: (s) => s.pinned || s.seasonsPinned.length > 0 },
  { key: "streamed", label: "Streamed", test: (s) => s.state === "streamed" },
  { key: "local", label: "Has local copies", test: (s) => s.copies > 0 },
  { key: "attention", label: "Needs attention", test: (s) => s.state === "unseen" },
  { key: "none", label: "No files", test: (s) => s.files === 0 },
];

// Refresh the library whenever the worker starts or finishes something, so the labels catch up straight away
watch(
  () => [activity.value?.current?.path, activity.value?.last],
  () => cache.invalidateQueries({ queryKey: ["series"] }),
);

// How many series each filter would show, for the counts on the filter buttons
const counts = computed(() =>
  Object.fromEntries(FILTERS.map((f) => [f.key, (data.value?.series ?? []).filter(f.test).length])),
);

// The series in the chosen filter whose title matches the search
const shows = computed(() => {
  const test = FILTERS.find((f) => f.key === filter.value)!.test;
  const term = search.value.trim().toLowerCase();
  return (data.value?.series ?? []).filter((s) => test(s) && s.title.toLowerCase().includes(term));
});

/**
 * The label for a series' card: what the worker is doing to it right now (while copying, which of the pinned files it's
 * on), or else where its files live.
 */
function badge(show: Show) {
  const current = activity.value?.current;
  if (current?.arr === show.arr && current.media === show.id) {
    const pinned = show.seasons.filter((s) => show.pinned || show.seasonsPinned.includes(s.number));
    const files = pinned.reduce((total, s) => total + s.files, 0);
    const detail = current.action === "copying" ? `${Math.min(show.copies + 1, files)}/${files}` : undefined;
    return { state: current.action, detail };
  }
  return { state: show.state };
}

/**
 * Pins or unpins a whole series. A partly pinned series (some seasons pinned) gets pinned as a whole. Unpinning that
 * will delete copies and leave episodes missing until Sonarr downloads them again asks first.
 */
async function toggle(show: Show) {
  if (show.pinned && show.copies && options.value?.unpin === "regrab") {
    const choice = await ConfirmService.ask({
      title: `Unpin ${show.title}?`,
      summary: "Unpinning is set to always re-grab.",
      steps: [
        show.copies === 1 ? "Delete Tetharr's local copy" : `Delete Tetharr's ${show.copies} local copies`,
        "Ask Sonarr to download each season again",
      ],
      consequences: [{ tone: "warning", text: "Those episodes are missing until Sonarr downloads them again." }],
      choices: [{ value: "unpin", label: "Unpin and re-grab", tone: "error" }],
    });
    if (!choice) return;
  }
  pin({ arr: show.arr, id: show.id, pinned: !show.pinned });
}

/**
 * A series' details line: its year and how many episode files it has. Sizes are on the series' own page, so the line
 * fits the card.
 */
const details = (show: Show) => `${show.year} · ${show.files} file${show.files === 1 ? "" : "s"}`;
</script>

<template>
  <PageHeaderComponent title="Series" :detail="data ? `${data.series.length} series` : undefined">
    <label class="input w-full sm:w-64">
      <PhMagnifyingGlass class="size-4 opacity-50" />
      <input v-model="search" type="search" placeholder="Search titles" />
    </label>
  </PageHeaderComponent>

  <!-- A Sonarr that can't be reached has its series missing from the list, not gone -->
  <ProblemsComponent :errors="[...(data?.errors ?? []), error?.message, pinError?.message]" />
  <OrphansComponent v-if="data" :orphans="data.orphans" kind="series" class="mb-5" />

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
    v-else-if="data && !data.series.length && !data.errors.length"
    :icon="PhPlugs"
    title="No series yet"
  >
    Connect a Sonarr to see its series.
    <RouterLink to="/settings" class="btn btn-primary btn-sm">Go to settings</RouterLink>
  </EmptyStateComponent>

  <template v-else-if="data?.series.length">
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

    <EmptyStateComponent v-if="!shows.length" :icon="PhMagnifyingGlass" title="Nothing matches">
      Try a different search or filter.
    </EmptyStateComponent>

    <ul v-else class="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-4">
      <PosterCardComponent
        v-for="show in shows"
        :key="`${show.arr}-${show.id}`"
        :title="show.title"
        :poster="show.poster"
        :details="details(show)"
        :pinned="show.pinned"
        :partly="show.seasonsPinned.length > 0"
        :pinnable="true"
        :to="`/series/${show.arr}/${show.id}`"
        @pin="toggle(show)"
      >
        <StateBadgeComponent v-bind="badge(show)" />
      </PosterCardComponent>
    </ul>
  </template>
</template>
