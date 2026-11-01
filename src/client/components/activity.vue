<script setup lang="ts">
/**
 * What the worker is doing, shown at the bottom of the sidebar, with a progress bar while it copies. Clicking it opens
 * the title it's working on. Nothing shows while the worker is idle.
 */

import { computed } from "vue";
import * as ActivityService from "../services/activity.ts";

const { data } = ActivityService.useStatus();

// What each worker action is called here
const ACTIONS = { copying: "Copying", restoring: "Restoring", regrabbing: "Re-grabbing" };

// The page of the title being worked on. Only a series' steps have a season, which tells the two apart, and a series'
// page opens at that season
const to = computed(() => {
  const current = data.value?.current;
  if (!current) return;
  const { arr, media, season } = current;
  return season === null ? `/movies/${arr}/${media}` : `/series/${arr}/${media}#season-${season}`;
});

// How far the copy has got, as a whole percentage
const percent = computed(() => {
  const progress = data.value?.current?.progress;
  return progress?.size ? Math.floor((progress.done / progress.size) * 100) : undefined;
});
</script>

<template>
  <RouterLink v-if="data?.current && to" :to="to" class="group block rounded-field px-3 text-sm">
    <div class="flex items-center justify-between gap-2">
      <span class="font-medium text-primary">{{ ACTIONS[data.current.action] }}</span>
      <span v-if="percent !== undefined" class="font-mono text-xs text-base-content/60">{{ percent }}%</span>
    </div>
    <p class="truncate text-base-content/70 group-hover:text-base-content">{{ data.current.title }}</p>
    <progress
      v-if="data.current.action === 'copying'"
      class="progress mt-2 h-1.5 progress-primary"
      :value="percent"
      max="100"
    />
  </RouterLink>
</template>
