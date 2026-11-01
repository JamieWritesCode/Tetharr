<script setup lang="ts">
/**
 * The copies Tetharr made of titles an Arr has since removed. Tetharr leaves them alone, so each one can be kept (it
 * stays where it is, unmanaged) or deleted, after the user confirms what that means. Shows nothing when there are none.
 */

import { PhCheck, PhTrash, PhWarningCircle } from "@phosphor-icons/vue";
import { size } from "../format.ts";
import * as ConfirmService from "../services/confirm.ts";
import * as CopiesService from "../services/copies.ts";
import SectionCardComponent from "./section-card.vue";

type Orphan = { arr: string; path: string; size: number };

defineProps<{ orphans: Orphan[]; kind: "movies" | "series" }>();
const { mutate: resolve, error } = CopiesService.useResolve();

/**
 * Keeps or deletes one copy, after the user confirms what that means.
 */
async function settle(orphan: Orphan, action: "keep" | "delete") {
  const name = orphan.path.split("/").at(-2);
  const choice = await ConfirmService.ask(
    action === "keep"
      ? {
          title: `Keep ${name}?`,
          consequences: [
            { tone: "info", text: "The file stays, as an unmanaged local file." },
            { tone: "info", text: "Tetharr forgets it and never touches it again." },
          ],
          choices: [{ value: "keep", label: "Keep the file" }],
        }
      : {
          title: `Delete ${name}?`,
          steps: [`Delete Tetharr's copy (${size(orphan.size)})`],
          consequences: [
            { tone: "error", text: `${orphan.arr} no longer lists this title, so nothing downloads it again.` },
            { tone: "success", text: `Frees ${size(orphan.size)} of local space.` },
          ],
          choices: [{ value: "delete", label: "Delete the copy", tone: "error" }],
        },
  );
  if (choice) resolve({ path: orphan.path, action });
}
</script>

<template>
  <SectionCardComponent
    v-if="orphans.length"
    :title="`Copies of ${kind} removed from ${kind === 'movies' ? 'Radarr' : 'Sonarr'}`"
  >
    <div v-if="error" role="alert" class="m-5 alert alert-soft alert-error">
      <PhWarningCircle class="size-5" />{{ error.message }}
    </div>
    <ul class="divide-y divide-base-300">
      <li v-for="orphan in orphans" :key="orphan.path" class="flex flex-wrap items-center gap-4 px-5 py-3">
        <div class="min-w-0 flex-1">
          <p class="truncate font-medium">{{ orphan.path.split("/").at(-2) }}</p>
          <p class="truncate font-mono text-xs text-base-content/60">{{ orphan.path }} · {{ size(orphan.size) }}</p>
        </div>
        <div class="flex gap-2">
          <button type="button" class="btn btn-ghost btn-sm" @click="settle(orphan, 'keep')">
            <PhCheck class="size-4" />Keep
          </button>
          <button type="button" class="btn btn-ghost text-error btn-sm" @click="settle(orphan, 'delete')">
            <PhTrash class="size-4" />Delete
          </button>
        </div>
      </li>
    </ul>
  </SectionCardComponent>
</template>
