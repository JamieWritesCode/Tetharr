<script setup lang="ts">
/**
 * What a page shows when it has nothing to list yet: an icon, a short title, and a line or two (and maybe a button)
 * saying what to do about it.
 */

import type { Component } from "vue";

defineProps<{ icon: Component; title: string }>();
</script>

<template>
  <div class="card bg-base-100 card-border">
    <div class="card-body items-center gap-3 py-16 text-center">
      <span class="grid size-12 place-items-center rounded-full bg-base-200 text-base-content/60">
        <component :is="icon" class="size-6" />
      </span>
      <h2 class="font-semibold">{{ title }}</h2>
      <div class="flex max-w-sm flex-col items-center gap-4 text-sm text-base-content/60">
        <slot />
      </div>
    </div>
  </div>
</template>
