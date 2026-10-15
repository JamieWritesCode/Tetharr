<script setup lang="ts">
/**
 * Tetharr's mark, name and version. The anchor stands for a title held fast on local disk, tethered rather than adrift.
 * The version is read from package.json when the interface is built, so package.json stays the only place it's set.
 */

import { PhAnchorSimple } from "@phosphor-icons/vue";
import { version } from "../../../package.json";
</script>

<template>
  <RouterLink to="/" class="flex items-center gap-2.5">
    <span class="grid size-9 place-items-center rounded-field bg-primary text-primary-content">
      <PhAnchorSimple weight="bold" class="size-5" />
    </span>
    <span class="text-lg font-bold tracking-tight">Tetharr</span>
    <span class="font-mono text-xs text-base-content/50">v{{ version }}</span>
  </RouterLink>
</template>
