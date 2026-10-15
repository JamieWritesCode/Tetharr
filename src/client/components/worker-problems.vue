<script setup lang="ts">
/**
 * The problems the worker hit on its last pass, with a countdown to its next try, so a passing problem is visibly about
 * to be rechecked. They concern the whole app rather than one page, so they sit at the bottom of the sidebar (compact),
 * or at the top of the page on phones, which have no sidebar. Shows nothing when all is well.
 */

import { PhWarningCircle } from "@phosphor-icons/vue";
import { computed, onUnmounted, ref } from "vue";
import * as ActivityService from "../services/activity.ts";

defineProps<{ compact?: boolean }>();
const { data: activity } = ActivityService.useStatus();
const errors = computed(() => activity.value?.errors ?? []);

// The time now, updated every second, so the countdown stays live
const now = ref(Date.now());
const tick = setInterval(() => (now.value = Date.now()), 1000);
onUnmounted(() => clearInterval(tick));

// When the worker will try again, counting down
const retry = computed(() => {
  const next = activity.value?.next;
  if (!next) return;
  const seconds = Math.max(0, Math.round((Date.parse(next) - now.value) / 1000));
  if (!seconds) return "Trying again now";
  return `Trying again in ${seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`}`;
});
</script>

<template>
  <div v-if="errors.length" class="flex flex-col gap-2">
    <div v-if="compact" role="alert" class="flex flex-col gap-2 rounded-box bg-error/10 p-3 text-xs text-error">
      <p v-for="message in errors" :key="message" class="flex gap-2">
        <PhWarningCircle class="size-4 shrink-0" /><span class="min-w-0 break-words">{{ message }}</span>
      </p>
      <p v-if="retry" class="pl-6 opacity-70">{{ retry }}</p>
    </div>
    <template v-else>
      <!-- The countdown sits at the far right on larger screens, and under the message on phones -->
      <div
        v-for="message in errors"
        :key="message"
        role="alert"
        class="alert alert-soft alert-error max-sm:grid-flow-row max-sm:grid-cols-[auto_1fr]"
      >
        <PhWarningCircle class="size-5" />
        <span>{{ message }}</span>
        <span v-if="retry" class="text-xs whitespace-nowrap opacity-70 max-sm:col-start-2">{{ retry }}</span>
      </div>
    </template>
  </div>
</template>
