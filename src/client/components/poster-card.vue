<script setup lang="ts">
/**
 * A title in a library grid: its poster, name and a line of details, a slot for its status, and a pin button. The pin
 * button is solid when the title is pinned, ringed when only part of it is (some seasons of a series), and otherwise
 * appears on hover (always, on touch screens). Given an address, the poster and name lead to the title's own page.
 */

import { PhFilmSlate, PhPushPin } from "@phosphor-icons/vue";
import type { RouteLocationRaw } from "vue-router";

defineProps<{
  title: string;
  poster: string | undefined;
  details: string;
  pinned: boolean;
  partly?: boolean | undefined;
  pinnable: boolean;
  to?: RouteLocationRaw | undefined;
}>();
const emit = defineEmits<{ pin: [] }>();
</script>

<template>
  <li class="group card overflow-hidden bg-base-100 transition-colors card-border hover:border-primary/50">
    <figure class="relative grid aspect-2/3 place-items-center bg-base-300">
      <img v-if="poster" :src="poster" :alt="title" loading="lazy" class="size-full object-cover" />
      <PhFilmSlate v-else class="size-10 text-base-content/30" />
      <RouterLink v-if="to" :to="to" class="absolute inset-0" :aria-label="title" />
      <button
        v-if="pinnable"
        type="button"
        class="btn absolute top-2 right-2 btn-circle transition-opacity btn-sm"
        :class="
          pinned
            ? 'btn-primary'
            : partly
              ? 'border-primary bg-base-100/90 text-primary backdrop-blur-sm'
              : 'border-base-300 bg-base-100/90 backdrop-blur-sm group-hover:opacity-100 focus-visible:opacity-100 lg:opacity-0'
        "
        :aria-pressed="pinned ? true : partly ? 'mixed' : false"
        :aria-label="pinned ? `Unpin ${title}` : `Pin ${title}`"
        :title="pinned ? 'Pinned' : partly ? 'Partly pinned' : 'Pin'"
        @click="emit('pin')"
      >
        <PhPushPin :weight="pinned ? 'fill' : partly ? 'duotone' : 'bold'" class="size-4" />
      </button>
    </figure>
    <div class="card-body gap-1.5 p-3">
      <RouterLink v-if="to" :to="to" class="truncate text-sm font-semibold hover:text-primary" :title="title">
        {{ title }}
      </RouterLink>
      <h2 v-else class="truncate text-sm font-semibold" :title="title">{{ title }}</h2>
      <p class="truncate font-mono text-xs text-base-content/60" :title="details">{{ details }}</p>
      <div class="mt-1 flex flex-wrap gap-1 empty:hidden">
        <slot />
      </div>
    </div>
  </li>
</template>
