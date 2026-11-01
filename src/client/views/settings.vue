<script setup lang="ts">
/**
 * The settings page, in four sections: the Arr connections (each added, edited or removed in a dialog), the pinning
 * options, the appearance of the app in this browser, and the diagnostics bundle for reporting a problem. Every setting
 * is a row that saves as soon as it changes.
 */

import { PhDownloadSimple, PhPencilSimple, PhPlugs, PhPlus, PhWarningCircle } from "@phosphor-icons/vue";
import { nextTick, ref, watch } from "vue";
import ArrFormComponent from "../components/arr-form.vue";
import ArrIconComponent from "../components/arr-icon.vue";
import PageHeaderComponent from "../components/page-header.vue";
import SectionCardComponent from "../components/section-card.vue";
import SettingRowComponent from "../components/setting-row.vue";
import { size } from "../format.ts";
import * as ArrsService from "../services/arrs.ts";
import * as DiagnosticsService from "../services/diagnostics.ts";
import * as SettingsService from "../services/settings.ts";
import * as ThemeService from "../services/theme.ts";

const { data: arrs, isPending, error } = ArrsService.useList();
const reserve = SettingsService.useSetting("reserve_gb");
const unpin = SettingsService.useSetting("unpin");
const { choice: theme } = ThemeService.useTheme();

// Which connection the dialog is open for: an existing one, a new one, or none when the dialog is closed
const editing = ref<NonNullable<typeof arrs.value>[number] | "new">();
const dialog = ref<HTMLDialogElement>();

// Open the dialog once its form is on the page, and close it when editing ends
watch(editing, async (value) => {
  await nextTick();
  if (value) dialog.value?.showModal();
  else dialog.value?.close();
});

// The ways unpinning can work
const UNPIN = [
  { value: "restore", label: "Restore the link" },
  { value: "regrab", label: "Always re-grab" },
] as const;

const THEMES = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

// The number being typed into "Keep free", saved when the user leaves the field or presses Enter
const free = ref<number>();
watch(reserve.value, (value) => (free.value = value), { immediate: true });
</script>

<template>
  <PageHeaderComponent title="Settings" />

  <div class="flex flex-col gap-6">
    <SectionCardComponent title="Connections">
      <template #actions>
        <button type="button" class="btn btn-primary btn-sm" @click="editing = 'new'">
          <PhPlus weight="bold" class="size-4" />Add connection
        </button>
      </template>

      <div v-if="error" role="alert" class="m-5 alert alert-soft alert-error">
        <PhWarningCircle class="size-5" />{{ error.message }}
      </div>

      <div v-if="isPending" class="flex flex-col gap-3 p-5">
        <div v-for="i in 2" :key="i" class="h-12 w-full skeleton" />
      </div>

      <div v-else-if="!arrs?.length" class="flex flex-col items-center gap-2 px-5 py-12 text-center">
        <PhPlugs class="size-8 text-base-content/40" />
        <p class="text-sm text-base-content/60">No connections yet.</p>
      </div>

      <ul v-else class="divide-y divide-base-300">
        <li v-for="arr in arrs" :key="arr.id" class="flex items-center gap-4 px-5 py-4">
          <ArrIconComponent :type="arr.type" />
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="truncate font-medium">{{ arr.name }}</span>
              <span v-if="arr.removing" class="badge badge-soft badge-sm badge-warning">Removing…</span>
            </div>
            <p class="truncate font-mono text-xs text-base-content/60">
              {{ arr.url }} · {{ arr.path_mappings.length }} mapping{{ arr.path_mappings.length === 1 ? "" : "s"
              }}<template v-if="arr.copies">
                · {{ arr.copies }} {{ arr.copies === 1 ? "copy" : "copies" }} ({{ size(arr.bytes) }})</template
              >
            </p>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" @click="editing = arr">
            <PhPencilSimple class="size-4" /><span class="hidden sm:inline">Edit</span>
          </button>
        </li>
      </ul>
    </SectionCardComponent>

    <SectionCardComponent title="Pinning">
      <div class="divide-y divide-base-300">
        <SettingRowComponent
          label="Keep free"
          description="Space to leave free on the library's disk after every copy."
          :state="reserve.state.value"
          :error="reserve.error.value"
        >
          <label class="input w-full sm:w-32" :class="{ 'input-error': reserve.state.value === 'error' }">
            <input
              v-model.number="free"
              type="number"
              min="0"
              class="grow font-mono"
              aria-label="Keep free, in gigabytes"
              @change="free !== reserve.value.value && reserve.save(free as number)"
            />
            <span class="text-base-content/60">GB</span>
          </label>
        </SettingRowComponent>

        <SettingRowComponent
          label="When a title is unpinned"
          description="Restore puts the link back. Re-grab deletes the copy and has the Arr download it again."
          :state="unpin.state.value"
          :error="unpin.error.value"
        >
          <select
            class="select w-full sm:w-56"
            aria-label="When a title is unpinned"
            :value="unpin.value.value"
            @change="unpin.save(($event.target as HTMLSelectElement).value as 'restore' | 'regrab')"
          >
            <option v-for="option in UNPIN" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
        </SettingRowComponent>
      </div>
    </SectionCardComponent>

    <SectionCardComponent title="Appearance">
      <SettingRowComponent label="Theme" description="This browser only.">
        <select v-model="theme" class="select w-full sm:w-56" aria-label="Theme">
          <option v-for="option in THEMES" :key="option.value" :value="option.value">{{ option.label }}</option>
        </select>
      </SettingRowComponent>
    </SectionCardComponent>

    <SectionCardComponent title="Diagnostics">
      <SettingRowComponent
        label="Bundle"
        description="Setup, checks, history and log, for bug reports. Has titles and paths, never API keys."
      >
        <a :href="DiagnosticsService.url" download class="btn w-full sm:w-auto">
          <PhDownloadSimple class="size-4" />Download
        </a>
      </SettingRowComponent>
    </SectionCardComponent>
  </div>

  <dialog ref="dialog" class="modal modal-bottom sm:modal-middle" @close="editing = undefined">
    <div class="modal-box max-w-2xl">
      <ArrFormComponent
        v-if="editing"
        :key="editing === 'new' ? 'new' : editing.id"
        :arr="editing === 'new' ? undefined : editing"
        @done="editing = undefined"
      />
    </div>
    <form method="dialog" class="modal-backdrop"><button>Close</button></form>
  </dialog>
</template>
