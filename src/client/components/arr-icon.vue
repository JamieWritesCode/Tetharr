<script setup lang="ts">
/**
 * A tile showing which kind of Arr something is, tinted with that Arr's own colour. The icons match the navigation: a
 * film strip for Radarr (movies), a television for Sonarr (series).
 */

import { PhFilmStrip, PhTelevisionSimple } from "@phosphor-icons/vue";

defineProps<{ type: "radarr" | "sonarr" }>();
</script>

<template>
  <span class="grid size-10 shrink-0 place-items-center rounded-field" :class="`arr-${type}`">
    <PhFilmStrip v-if="type === 'radarr'" class="size-5" />
    <PhTelevisionSimple v-else class="size-5" />
  </span>
</template>
