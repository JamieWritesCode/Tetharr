<script setup lang="ts">
/**
 * The title row at the top of every page, with an optional line of detail under it and room for actions on the right.
 */

defineProps<{ title: string; detail?: string | undefined }>();
</script>

<template>
  <header class="mb-6 flex flex-wrap items-end justify-between gap-4">
    <div>
      <h1 class="text-2xl font-bold tracking-tight">{{ title }}</h1>
      <p v-if="detail" class="mt-1 text-sm text-base-content/60">{{ detail }}</p>
    </div>
    <div class="flex flex-wrap items-center gap-2 max-sm:w-full">
      <slot />
    </div>
  </header>
</template>
