<script setup lang="ts">
/**
 * The frame around every page. On larger screens a sidebar holds the brand, the navigation, and what the worker is
 * doing. On phones the brand sits at the top and the navigation becomes a tab bar along the bottom.
 */

import { PhFilmStrip, PhGearSix } from "@phosphor-icons/vue";
import ActivityComponent from "./components/activity.vue";
import BrandComponent from "./components/brand.vue";
import ConfirmDialogComponent from "./components/confirm-dialog.vue";

// The pages in the navigation, with their icons
const PAGES = [
  { to: "/movies", label: "Movies", icon: PhFilmStrip },
  { to: "/settings", label: "Settings", icon: PhGearSix },
];
</script>

<template>
  <div class="flex min-h-dvh">
    <aside
      class="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-8 border-r border-base-300 bg-base-100 px-4 py-5 lg:flex"
    >
      <BrandComponent class="px-2" />
      <nav class="flex flex-col gap-1">
        <RouterLink
          v-for="page in PAGES"
          :key="page.to"
          v-slot="{ isActive }"
          :to="page.to"
          class="flex items-center gap-3 rounded-field px-3 py-2 text-sm font-medium text-base-content/70 transition-colors hover:bg-base-200 hover:text-base-content"
          active-class="bg-primary/10 !text-primary"
        >
          <component :is="page.icon" :weight="isActive ? 'fill' : 'regular'" class="size-5" />
          {{ page.label }}
        </RouterLink>
      </nav>
      <ActivityComponent class="mt-auto" />
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <header class="px-4 pt-4 lg:hidden">
        <BrandComponent />
      </header>
      <main class="w-full flex-1 px-4 pt-6 pb-24 sm:px-6 lg:px-10 lg:pt-8 lg:pb-10">
        <div class="mx-auto max-w-7xl">
          <RouterView />
        </div>
      </main>
    </div>

    <!-- The active tab is shown in the primary colour, so daisyUI's underline is hidden -->
    <nav class="dock border-t border-base-300 bg-base-100 lg:hidden">
      <RouterLink
        v-for="page in PAGES"
        :key="page.to"
        v-slot="{ isActive }"
        :to="page.to"
        class="text-base-content/60 after:hidden"
        active-class="!text-primary"
      >
        <component :is="page.icon" :weight="isActive ? 'fill' : 'regular'" class="size-5" />
        <span class="dock-label">{{ page.label }}</span>
      </RouterLink>
    </nav>
    <ConfirmDialogComponent />
  </div>
</template>
