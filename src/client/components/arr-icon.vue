<script setup lang="ts">
/**
 * A tile with the mark for a kind of Arr, tinted with that Arr's own colour. The marks are drawn in the same style as
 * the Phosphor icons (a 256 grid, 16-wide round strokes) and loosely follow each logo: a play button for Radarr, a
 * ringed hub for Sonarr.
 */

defineProps<{ type: "radarr" | "sonarr" }>();
</script>

<template>
  <span class="grid size-10 shrink-0 place-items-center rounded-field" :class="`arr-${type}`">
    <svg
      viewBox="0 0 256 256"
      class="size-6"
      fill="none"
      stroke="currentColor"
      stroke-width="16"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <template v-if="type === 'radarr'">
        <path d="M60 36 220 128 60 220Z" />
        <path d="M100 92 160 128 100 164Z" fill="currentColor" />
      </template>
      <template v-else>
        <circle cx="128" cy="128" r="104" />
        <circle cx="128" cy="128" r="28" fill="currentColor" />
        <path d="M160 96 202 54M96 96 54 54M96 160 54 202M160 160 202 202" />
      </template>
    </svg>
  </span>
</template>
