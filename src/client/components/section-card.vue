<script setup lang="ts">
/**
 * A card for one section of a page: a header with a title and room for actions, then the section's content. Settings
 * sections, and lists like the copies waiting for a decision, all use it.
 */

defineProps<{ title: string }>();
</script>

<template>
  <section class="card bg-base-100 card-border">
    <div class="card-body gap-0 p-0">
      <header class="flex flex-wrap items-center justify-between gap-4 border-b border-base-300 p-5">
        <h2 class="text-lg font-semibold tracking-tight">{{ title }}</h2>
        <div class="flex flex-wrap gap-2 empty:hidden">
          <slot name="actions" />
        </div>
      </header>
      <slot />
    </div>
  </section>
</template>
