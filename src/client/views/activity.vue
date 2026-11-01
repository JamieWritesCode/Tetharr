<script setup lang="ts">
/**
 * The Activity page, in two tabs. The queue shows what the worker is doing now, with how far a copy has got, then what
 * it still has to do, in the order it will get there. The history shows what it has done, newest first, with what went
 * wrong when something failed. Each row links to its title's page.
 */

import {
  PhArrowClockwise,
  PhCheckCircle,
  PhClockCounterClockwise,
  PhCopySimple,
  PhLinkSimple,
  PhWarningCircle,
} from "@phosphor-icons/vue";
import { useQueryClient } from "@tanstack/vue-query";
import { computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import EmptyStateComponent from "../components/empty-state.vue";
import PageHeaderComponent from "../components/page-header.vue";
import ProblemsComponent from "../components/problems.vue";
import StateBadgeComponent from "../components/state-badge.vue";
import { size, time } from "../format.ts";
import * as ActivityService from "../services/activity.ts";

const route = useRoute();
const router = useRouter();
const { data: activity } = ActivityService.useStatus();
const { data: queue, isPending: queuing, error: queueError } = ActivityService.useQueue();
const {
  data: history,
  isPending: loading,
  error: historyError,
  fetchNextPage,
  hasNextPage,
} = ActivityService.useHistory();
const cache = useQueryClient();

// The open tab, kept in the address so it survives a reload and can be linked to
const tab = computed({
  get: () => (route.query.tab === "history" ? "history" : "queue"),
  set: (value) => router.replace({ query: value === "queue" ? {} : { tab: value } }),
});

// Refresh both tabs whenever the worker starts or finishes something
watch(
  () => [activity.value?.current?.path, activity.value?.last],
  () => {
    cache.invalidateQueries({ queryKey: ["activity", "queue"] });
    cache.invalidateQueries({ queryKey: ["activity", "history"] });
  },
);

// What the worker is doing now, and how far a copy has got
const current = computed(() => activity.value?.current);
const percent = computed(() => {
  const progress = current.value?.progress;
  return progress?.size ? Math.floor((progress.done / progress.size) * 100) : undefined;
});

// What's still waiting, leaving out the file being worked on, which is shown above the rest
const waiting = computed(() => (queue.value?.steps ?? []).filter((s) => s.path !== current.value?.path));
const entries = computed(() => history.value?.pages.flatMap((p) => p.entries) ?? []);

// What each step is called in the queue, and how each finished one looks in the history
const STEPS = { copy: "Copy", restore: "Restore the link", regrab: "Re-grab" };
const DONE = {
  copy: { label: "Copied", tone: "badge-success", icon: PhCopySimple },
  restore: { label: "Restored", tone: "badge-info", icon: PhLinkSimple },
  regrab: { label: "Re-grabbed", tone: "badge-warning", icon: PhArrowClockwise },
};
const FAILED = { copy: "Copy failed", restore: "Restore failed", regrab: "Re-grab failed" };

/**
 * A file's name, shown under its title when the title doesn't already say it (an episode's title is its file name).
 */
const file = (row: { title: string; path: string }) => {
  const name = row.path.split("/").at(-1)!;
  return name.startsWith(row.title) ? undefined : name;
};
</script>

<template>
  <PageHeaderComponent title="Activity" />

  <ProblemsComponent :errors="[queueError?.message, historyError?.message]" />

  <div role="tablist" class="tabs tabs-border mb-5">
    <button
      type="button"
      role="tab"
      class="tab gap-2"
      :class="{ 'tab-active': tab === 'queue' }"
      @click="tab = 'queue'"
    >
      Queue
      <span v-if="queue" class="font-mono text-xs opacity-70">{{ waiting.length + (current ? 1 : 0) }}</span>
    </button>
    <button type="button" role="tab" class="tab" :class="{ 'tab-active': tab === 'history' }" @click="tab = 'history'">
      History
    </button>
  </div>

  <template v-if="tab === 'queue'">
    <div v-if="queuing" class="h-48 w-full skeleton" />
    <EmptyStateComponent v-else-if="!current && !waiting.length" :icon="PhCheckCircle" title="Nothing waiting">
      Every file matches what's pinned.
    </EmptyStateComponent>
    <ul v-else class="card divide-y divide-base-300 bg-base-100 card-border">
      <!-- What the worker is doing now, with a progress bar while it copies -->
      <li v-if="current" class="flex flex-col gap-2 px-5 py-4">
        <div class="grid grid-cols-[8rem_1fr] items-center gap-x-4">
          <StateBadgeComponent
            :state="current.action"
            :detail="percent === undefined ? undefined : `${percent}%`"
            class="justify-self-start"
          />
          <RouterLink :to="ActivityService.to(current)" class="min-w-0 flex-1 truncate font-medium hover:text-primary">
            {{ current.title }}
          </RouterLink>
        </div>
        <progress
          v-if="current.action === 'copying'"
          class="progress h-1.5 progress-primary"
          :value="percent"
          max="100"
        />
      </li>
      <li
        v-for="step in waiting"
        :key="step.path"
        class="grid grid-cols-[8rem_1fr] items-start gap-x-4 gap-y-1 px-5 py-3 sm:grid-cols-[8rem_1fr_auto]"
      >
        <StateBadgeComponent state="queued" class="mt-0.5 justify-self-start" />
        <div class="min-w-0 flex-1">
          <RouterLink :to="ActivityService.to(step)" class="block truncate font-medium hover:text-primary">
            {{ step.title }}
          </RouterLink>
          <p class="truncate text-xs text-base-content/60">{{ STEPS[step.action] }}</p>
        </div>
        <span v-if="step.size" class="col-start-2 font-mono text-xs text-base-content/60 sm:col-start-auto">{{
          size(step.size)
        }}</span>
      </li>
    </ul>
  </template>

  <template v-else>
    <div v-if="loading" class="h-48 w-full skeleton" />
    <EmptyStateComponent v-else-if="!entries.length" :icon="PhClockCounterClockwise" title="Nothing yet">
      Copies, restores and re-grabs will show up here.
    </EmptyStateComponent>
    <template v-else>
      <ul class="card divide-y divide-base-300 bg-base-100 card-border">
        <li
          v-for="entry in entries"
          :key="entry.id"
          class="grid grid-cols-[8rem_1fr] items-start gap-x-4 gap-y-1 px-5 py-3 sm:grid-cols-[8rem_1fr_auto]"
        >
          <span
            class="mt-0.5 badge gap-1 justify-self-start badge-soft badge-sm"
            :class="entry.error ? 'badge-error' : DONE[entry.action].tone"
          >
            <component :is="entry.error ? PhWarningCircle : DONE[entry.action].icon" weight="bold" class="size-3.5" />
            {{ entry.error ? FAILED[entry.action] : DONE[entry.action].label }}
          </span>
          <div class="min-w-0 flex-1">
            <RouterLink :to="ActivityService.to(entry)" class="block truncate font-medium hover:text-primary">
              {{ entry.title }}
            </RouterLink>
            <p v-if="file(entry)" class="truncate font-mono text-xs text-base-content/60" :title="entry.path">
              {{ file(entry) }}
            </p>
            <p v-if="entry.error" class="text-sm text-error">{{ entry.error }}</p>
          </div>
          <span class="col-start-2 font-mono text-xs text-base-content/60 sm:col-start-auto">
            <template v-if="entry.size">{{ size(entry.size) }} · </template>{{ time(entry.created) }}
          </span>
        </li>
      </ul>
      <button v-if="hasNextPage" type="button" class="btn mx-auto mt-4 flex btn-ghost btn-sm" @click="fetchNextPage()">
        Show older
      </button>
    </template>
  </template>
</template>
