<script setup lang="ts">
/**
 * One setting: its name and a description on the left, its control on the right. On phones the control drops below
 * the text, at full width. On larger screens the text is capped at the golden ratio of the row (61.8%), so long
 * descriptions stay easy to read. While saving it shows a spinner, then a brief check mark, or the problem if saving
 * failed.
 */

import { PhCheck } from "@phosphor-icons/vue";

defineProps<{
  label: string;
  description?: string | undefined;
  state?: "idle" | "saving" | "saved" | "error" | undefined;
  error?: string | undefined;
}>();
</script>

<template>
  <div class="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
    <div class="min-w-0 flex-1 sm:max-w-[61.8%]">
      <div class="flex items-center gap-2">
        <h3 class="text-sm font-medium">{{ label }}</h3>
        <span v-if="state === 'saving'" class="loading loading-xs loading-spinner text-base-content/50" />
        <PhCheck v-else-if="state === 'saved'" weight="bold" class="size-4 text-success" aria-label="Saved" />
      </div>
      <p v-if="description" class="text-sm text-base-content/60">{{ description }}</p>
      <p v-if="state === 'error' && error" class="mt-1 text-sm text-error">{{ error }}</p>
    </div>
    <div class="shrink-0 max-sm:w-full">
      <slot />
    </div>
  </div>
</template>
