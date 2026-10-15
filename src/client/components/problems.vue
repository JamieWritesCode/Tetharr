<script setup lang="ts">
/**
 * The problems at the top of a library page that belong to that page: an Arr that couldn't be reached just now, or an
 * action that failed. Problems the worker also hit are left out, since the sidebar already shows them with a countdown.
 * Shows nothing when all is well.
 */

import { PhWarningCircle } from "@phosphor-icons/vue";
import { computed } from "vue";
import * as ActivityService from "../services/activity.ts";

const props = defineProps<{ errors: (string | undefined)[] }>();
const { data: activity } = ActivityService.useStatus();

// Each problem once, leaving out any the worker reports
const shown = computed(() => {
  const worker = activity.value?.errors ?? [];
  return [...new Set(props.errors.filter((e): e is string => !!e && !worker.includes(e)))];
});
</script>

<template>
  <div class="mb-4 flex flex-col gap-2 empty:hidden">
    <div v-for="message in shown" :key="message" role="alert" class="alert alert-soft alert-error">
      <PhWarningCircle class="size-5" />{{ message }}
    </div>
  </div>
</template>
