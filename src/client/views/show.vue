<script setup lang="ts">
/**
 * One series' own page: its details and a pin button for the whole series, then every season as a row with what its
 * episode files are right now, a pin button for that season alone, and the list of its files. While the whole series is
 * pinned, it covers every season, so the season buttons are switched off. An address ending in #season-N scrolls to
 * that season with its files unfolded, so a link can point straight at one season.
 */

import { PhArrowLeft, PhFilmSlate, PhPushPin } from "@phosphor-icons/vue";
import { useQueryClient } from "@tanstack/vue-query";
import { computed, nextTick, watch } from "vue";
import { useRoute } from "vue-router";
import ProblemsComponent from "../components/problems.vue";
import SectionCardComponent from "../components/section-card.vue";
import StateBadgeComponent from "../components/state-badge.vue";
import { size } from "../format.ts";
import * as ActivityService from "../services/activity.ts";
import * as ConfirmService from "../services/confirm.ts";
import * as SeriesService from "../services/series.ts";
import * as SettingsService from "../services/settings.ts";

const route = useRoute();
const arr = computed(() => Number(route.params.arr));
const id = computed(() => Number(route.params.id));
const { data: show, isPending, error } = SeriesService.useOne(arr, id);
const { data: activity } = ActivityService.useStatus();
const { data: options } = SettingsService.useOptions();
const { mutate: pin, error: pinError } = SeriesService.usePin();
const cache = useQueryClient();

type Show = NonNullable<typeof show.value>;
type Entry = Show["entries"][number];

// Refresh the series whenever the worker starts or finishes something, so the labels catch up straight away
watch(
  () => [activity.value?.current?.path, activity.value?.last],
  () => cache.invalidateQueries({ queryKey: ["series"] }),
);

// Once the series has loaded, scroll to the season the address names, if any
watch(
  () => [route.hash, !!show.value],
  async () => {
    await nextTick();
    if (route.hash) document.querySelector(route.hash)?.scrollIntoView({ behavior: "smooth" });
  },
);

// The seasons in order, with specials last, each with its files and whether it's pinned (on its own, or by the series)
const seasons = computed(() =>
  [...(show.value?.seasons ?? [])]
    .sort((a, b) => Number(a.number === 0) - Number(b.number === 0) || a.number - b.number)
    .map((season) => ({
      ...season,
      name: season.number ? `Season ${season.number}` : "Specials",
      items: show.value!.entries.filter((e) => e.season === season.number),
      pinned: show.value!.pinned || show.value!.seasonsPinned.includes(season.number),
    })),
);
type Season = (typeof seasons.value)[number];

// How many of the series' files are local copies Tetharr made
const copies = computed(() => show.value?.entries.filter((e) => e.managed).length ?? 0);

/**
 * How far the worker's current copy has got, as a percentage.
 */
function progress() {
  const done = activity.value?.current?.progress;
  return done?.size ? `${Math.floor((done.done / done.size) * 100)}%` : undefined;
}

/**
 * The label for one file: what the worker is doing to it, whether it's waiting for the worker, or where it lives.
 */
function badge(file: Entry, pinned: boolean) {
  const current = activity.value?.current;
  if (current?.path === file.path) return { state: current.action, detail: progress() };
  if ((pinned && file.state === "streamed") || (!pinned && file.managed)) return { state: "queued" as const };
  if (file.state === "local" && !file.managed) return { state: "unmanaged" as const };
  return { state: file.state };
}

/**
 * The label for a season, summing up its files: what the worker is doing in it (while copying, which file of the season
 * it's on, since the current file's percentage would read as the whole season's), anything that needs attention,
 * whether it's waiting for the worker, or how much of it is local.
 */
function summary(season: Season) {
  const current = activity.value?.current;
  const { items } = season;
  const local = items.filter((f) => f.state === "local").length;
  if (current?.arr === arr.value && current.media === id.value && current.season === season.number) {
    const detail = current.action === "copying" ? `${Math.min(local + 1, items.length)}/${items.length}` : undefined;
    return { state: current.action, detail };
  }
  if (!items.length) return { state: "none" as const };
  if (items.some((f) => f.state === "broken")) return { state: "broken" as const };
  if (items.some((f) => f.state === "unseen")) return { state: "unseen" as const };
  if (items.some((f) => (season.pinned && f.state === "streamed") || (!season.pinned && f.managed))) {
    return { state: "queued" as const };
  }
  if (!local) return { state: "streamed" as const };
  return local === items.length
    ? { state: "local" as const }
    : { state: "partial" as const, detail: `${local}/${items.length}` };
}

/**
 * Pins or unpins the whole series, or one season when given. Unpinning that will delete copies and leave episodes
 * missing until Sonarr downloads them again asks first. Unpinning that just restores links is instant, so it doesn't.
 */
async function toggle(season?: Season) {
  const series = show.value!;
  const pinned = season ? season.pinned : series.pinned;
  const scope = season ? season.items : series.entries;
  const managed = scope.filter((f) => f.managed);
  const regrab = managed.filter((f) => options.value?.unpin === "regrab" || !f.restorable);
  if (pinned && regrab.length) {
    const name = season ? `${series.title} ${season.name}` : series.title;
    const choice = await ConfirmService.ask({
      title: `Unpin ${name}?`,
      summary:
        options.value?.unpin === "regrab"
          ? "Unpinning is set to always re-grab."
          : "Some streamed files are gone, so their links can't simply be put back.",
      steps: [
        `Delete ${regrab.length === 1 ? "Tetharr's local copy" : `${regrab.length} of Tetharr's local copies`} (${size(regrab.reduce((t, f) => t + f.size, 0))})`,
        season ? "Ask Sonarr to download the season again" : "Ask Sonarr to download each season again",
      ],
      consequences: [
        { tone: "warning", text: "Those episodes will be missing until Sonarr finishes downloading them." },
      ],
      choices: [{ value: "unpin", label: "Unpin and re-grab", tone: "error" }],
    });
    if (!choice) return;
  }
  pin({ arr: arr.value, id: id.value, season: season?.number, pinned: !pinned });
}
</script>

<template>
  <RouterLink to="/series" class="btn mb-4 btn-ghost btn-sm"><PhArrowLeft class="size-4" />Series</RouterLink>

  <ProblemsComponent :errors="[error?.message, pinError?.message]" />

  <div v-if="isPending" class="flex flex-col gap-6">
    <div class="h-48 w-full skeleton" />
    <div class="h-64 w-full skeleton" />
  </div>

  <div v-else-if="show" class="flex flex-col gap-6">
    <section class="card bg-base-100 card-border">
      <div class="card-body flex-row gap-5 p-5">
        <div class="hidden w-28 shrink-0 overflow-hidden rounded-field bg-base-300 sm:block">
          <img v-if="show.poster" :src="show.poster" :alt="show.title" class="aspect-2/3 w-full object-cover" />
          <PhFilmSlate v-else class="m-auto size-10 text-base-content/30" />
        </div>
        <div class="flex min-w-0 flex-1 flex-col gap-2">
          <h1 class="text-2xl font-bold tracking-tight">{{ show.title }}</h1>
          <p class="font-mono text-xs text-base-content/60">
            {{ show.year }} · {{ show.files }} file{{ show.files === 1 ? "" : "s" }}
            <template v-if="show.size"> · {{ size(show.size) }}</template>
            <template v-if="copies"> · {{ copies }} local {{ copies === 1 ? "copy" : "copies" }}</template>
          </p>
          <p class="line-clamp-3 max-w-prose text-sm text-base-content/70">{{ show.overview }}</p>
          <div class="mt-auto pt-2">
            <button
              type="button"
              class="btn btn-sm"
              :class="show.pinned ? 'btn-primary' : ''"
              :aria-pressed="show.pinned"
              :title="show.pinned ? 'Unpin: free up the space and stream it again' : 'Pin: keep local copies'"
              @click="toggle()"
            >
              <PhPushPin :weight="show.pinned ? 'fill' : 'bold'" class="size-4" />
              {{ show.pinned ? "Series pinned" : "Pin series" }}
            </button>
          </div>
        </div>
      </div>
    </section>

    <SectionCardComponent
      title="Seasons"
      description="Pin a season to keep just its episodes local. Pinning the series covers every season, including new ones."
    >
      <ul class="divide-y divide-base-300">
        <li v-for="season in seasons" :id="`season-${season.number}`" :key="season.number" class="px-5 py-4">
          <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="font-medium">{{ season.name }}</h3>
                <StateBadgeComponent v-bind="summary(season)" />
              </div>
              <p class="font-mono text-xs text-base-content/60">
                {{ season.files }} of {{ season.episodes }} episodes
                <template v-if="season.size"> · {{ size(season.size) }}</template>
              </p>
            </div>
            <button
              type="button"
              class="btn btn-sm"
              :class="season.pinned ? 'btn-soft btn-primary' : 'btn-ghost'"
              :disabled="show.pinned"
              :aria-pressed="season.pinned"
              :title="
                show.pinned ? 'Covered by the series pin' : season.pinned ? 'Unpin this season' : 'Pin this season'
              "
              @click="toggle(season)"
            >
              <PhPushPin :weight="season.pinned ? 'fill' : 'bold'" class="size-4" />
              {{ season.pinned ? "Pinned" : "Pin" }}
            </button>
          </div>

          <!-- The season's files, folded away until wanted, or unfolded when the address names the season -->
          <details v-if="season.items.length" class="mt-2" :open="route.hash === `#season-${season.number}`">
            <summary class="cursor-pointer text-xs text-base-content/60 hover:text-base-content">
              {{ season.items.length }} file{{ season.items.length === 1 ? "" : "s" }}
            </summary>
            <ul class="mt-2 flex flex-col gap-1.5">
              <li v-for="file in season.items" :key="file.id" class="flex flex-wrap items-center justify-between gap-2">
                <span class="min-w-0 truncate font-mono text-xs" :title="file.path">{{ file.name }}</span>
                <StateBadgeComponent v-bind="badge(file, season.pinned)" :path="file.path" />
              </li>
            </ul>
          </details>
        </li>
      </ul>
    </SectionCardComponent>
  </div>
</template>
