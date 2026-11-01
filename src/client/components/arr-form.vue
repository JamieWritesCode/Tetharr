<script setup lang="ts">
/**
 * The form for adding or editing one Arr connection, shown in a dialog. It checks the fields with the same rules the
 * server uses, can test the connection before saving, and closes when you save, delete or cancel.
 */

import {
  PhArrowRight,
  PhCheck,
  PhCheckCircle,
  PhEye,
  PhEyeSlash,
  PhMinusCircle,
  PhPlugsConnected,
  PhPlus,
  PhTrash,
  PhWarningCircle,
  PhX,
  PhXCircle,
} from "@phosphor-icons/vue";
import { computed, reactive, ref, watch } from "vue";
import * as ArrSchema from "../../schemas/arr.ts";
import type { Arr, Input } from "../../schemas/arr.ts";
import * as ArrsService from "../services/arrs.ts";
import { size } from "../format.ts";
import * as ConfirmService from "../services/confirm.ts";
import ArrIconComponent from "./arr-icon.vue";

// A saved connection comes with how many local copies Tetharr has made for it, so removing it can explain what happens
type Saved = Arr & { copies: number; bytes: number };

const props = defineProps<{ arr: Saved | undefined }>();
const emit = defineEmits<{ done: [] }>();

const { mutate: save, isPending: saving, error: saveError } = ArrsService.useSave();
const { mutate: remove, isPending: removing, error: removeError } = ArrsService.useRemove();
const { mutate: test, isPending: testing, data: tested, error: testError, reset: untest } = ArrsService.useTest();

// Each kind of Arr, with the name and address it usually has in a Docker setup
const TYPES = {
  radarr: { label: "Radarr", detail: "Movies", name: "Radarr", url: "http://radarr:7878" },
  sonarr: { label: "Sonarr", detail: "Series", name: "Sonarr", url: "http://sonarr:8989" },
} as const;

// Start from a copy of the saved connection, or from typical values for a new Radarr
const form = reactive<Input>(
  props.arr
    ? JSON.parse(JSON.stringify(props.arr))
    : { type: "radarr", name: TYPES.radarr.name, url: TYPES.radarr.url, api_key: "", path_mappings: [] },
);
const reveal = ref(false);

// Check the fields, but only point out problems once the user has tried to test or save
const tried = ref(false);
const result = computed(() => ArrSchema.input.safeParse(form));
const problems = computed<Record<string, string>>(() =>
  tried.value && !result.value.success
    ? Object.fromEntries(result.value.error.issues.map((i) => [i.path.join("."), i.message]))
    : {},
);

// When the kind changes, swap in its typical name and address, unless the user has typed their own
watch(
  () => form.type,
  (type, old) => {
    if (form.name === TYPES[old].name) form.name = TYPES[type].name;
    if (form.url === TYPES[old].url) form.url = TYPES[type].url;
  },
);

// A test result is about the fields as they were, so clear it as soon as anything changes
watch(form, () => untest(), { deep: true });

/**
 * Runs an action with the checked fields, or reveals what needs fixing first.
 */
function submit(action: (input: Input) => void) {
  tried.value = true;
  if (result.value.success) action(result.value.data);
}

/**
 * Removes this connection after the user confirms how. With copies on disk, they choose between undoing the copies
 * first and leaving the files as they are. Without any, nothing in the Arr or on disk changes.
 */
async function forget(arr: Saved) {
  const copies = `${arr.copies} local ${arr.copies === 1 ? "copy" : "copies"} (${size(arr.bytes)})`;
  const choice = arr.copies
    ? await ConfirmService.ask({
        title: `Remove ${arr.name}?`,
        summary: `Tetharr has made ${copies} of titles in ${arr.name}.`,
        choices: [
          {
            value: "restore",
            label: "Restore everything, then remove",
            detail: `Unpin every title and put its links back, re-grabbing any that can't be. Then remove the connection.`,
            tone: "primary",
          },
          {
            value: "leave",
            label: "Remove now and leave the files",
            detail: `${arr.copies === 1 ? "The copy stays as an unmanaged file" : `The ${copies} stay as unmanaged files`}, never touched again.`,
            tone: "error",
          },
        ],
      })
    : await ConfirmService.ask({
        title: `Remove ${arr.name}?`,
        consequences: [{ tone: "info", text: `Nothing in ${arr.name} or in your library will change.` }],
        choices: [{ value: "leave", label: "Remove", tone: "error" }],
      });
  if (choice === "restore" || choice === "leave")
    remove({ id: arr.id, mode: choice }, { onSuccess: () => emit("done") });
}
</script>

<template>
  <form novalidate @submit.prevent="submit((input) => save({ id: arr?.id, input }, { onSuccess: () => emit('done') }))">
    <header class="mb-6 flex items-start justify-between gap-4">
      <h2 class="text-lg font-semibold">{{ arr ? `Edit ${arr.name}` : "Add a connection" }}</h2>
      <button type="button" class="btn btn-square btn-ghost btn-sm" aria-label="Close" @click="emit('done')">
        <PhX class="size-4" />
      </button>
    </header>

    <div class="flex flex-col gap-5">
      <div class="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Kind of Arr">
        <label
          v-for="(option, type) in TYPES"
          :key="type"
          class="flex cursor-pointer items-center gap-3 rounded-box border p-3 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-primary"
          :class="form.type === type ? 'border-primary bg-primary/5' : 'border-base-300 hover:border-base-content/30'"
        >
          <input v-model="form.type" type="radio" :value="type" class="sr-only" />
          <ArrIconComponent :type="type" />
          <span>
            <span class="block font-medium">{{ option.label }}</span>
            <span class="block text-xs text-base-content/60">{{ option.detail }}</span>
          </span>
        </label>
      </div>

      <div class="grid gap-x-4 sm:grid-cols-2">
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Name</legend>
          <input v-model="form.name" autofocus class="input w-full" :class="{ 'input-error': problems.name }" />
          <p v-if="problems.name" class="text-error">{{ problems.name }}</p>
        </fieldset>

        <fieldset class="fieldset">
          <legend class="fieldset-legend">Address</legend>
          <input
            v-model="form.url"
            type="url"
            class="input w-full font-mono"
            :class="{ 'input-error': problems.url }"
          />
          <p v-if="problems.url" class="text-error">{{ problems.url }}</p>
        </fieldset>

        <fieldset class="fieldset sm:col-span-2">
          <legend class="fieldset-legend">API key</legend>
          <label class="input w-full" :class="{ 'input-error': problems.api_key }">
            <input
              v-model="form.api_key"
              :type="reveal ? 'text' : 'password'"
              autocomplete="off"
              class="grow font-mono"
            />
            <button
              type="button"
              class="btn btn-square btn-ghost btn-xs"
              :aria-label="reveal ? 'Hide API key' : 'Show API key'"
              @click="reveal = !reveal"
            >
              <PhEyeSlash v-if="reveal" class="size-4" />
              <PhEye v-else class="size-4" />
            </button>
          </label>
          <p v-if="problems.api_key" class="text-error">{{ problems.api_key }}</p>
          <p v-else class="label">Found in the Arr under Settings → General.</p>
        </fieldset>
      </div>

      <section class="flex flex-col gap-3 rounded-box bg-base-200 p-4">
        <div>
          <h3 class="text-sm font-semibold">Path mappings</h3>
          <p class="text-sm text-base-content/60">
            Only needed if the Arr sees your library at a different path, like
            <code class="font-mono text-xs">/data/media</code> where Tetharr sees
            <code class="font-mono text-xs">/mnt/media</code>.
          </p>
        </div>
        <div
          v-for="(mapping, i) in form.path_mappings"
          :key="i"
          class="grid grid-cols-[1fr_auto_1fr_auto] items-start gap-2"
        >
          <div>
            <input
              v-model="mapping.from"
              placeholder="Path in the Arr"
              class="input w-full font-mono input-sm"
              :class="{ 'input-error': problems[`path_mappings.${i}.from`] }"
            />
            <p v-if="problems[`path_mappings.${i}.from`]" class="mt-1 text-xs text-error">
              {{ problems[`path_mappings.${i}.from`] }}
            </p>
          </div>
          <PhArrowRight class="mt-2 size-4 text-base-content/40" />
          <div>
            <input
              v-model="mapping.to"
              placeholder="Path in Tetharr"
              class="input w-full font-mono input-sm"
              :class="{ 'input-error': problems[`path_mappings.${i}.to`] }"
            />
            <p v-if="problems[`path_mappings.${i}.to`]" class="mt-1 text-xs text-error">
              {{ problems[`path_mappings.${i}.to`] }}
            </p>
          </div>
          <button
            type="button"
            class="btn btn-square btn-ghost btn-sm"
            aria-label="Remove mapping"
            @click="form.path_mappings.splice(i, 1)"
          >
            <PhTrash class="size-4" />
          </button>
        </div>
        <button
          type="button"
          class="btn self-start btn-ghost btn-sm"
          @click="form.path_mappings.push({ from: '', to: '' })"
        >
          <PhPlus weight="bold" class="size-4" />Add mapping
        </button>
      </section>

      <!-- The test's checks: passed, failed, or couldn't be checked, each with what was found or what to change -->
      <ul v-if="tested" class="flex flex-col gap-3 rounded-box bg-base-200 p-4" aria-label="Test results">
        <li v-for="check in tested.checks" :key="check.label" class="flex gap-3 text-sm">
          <PhCheckCircle v-if="check.ok" weight="fill" class="size-5 shrink-0 text-success" />
          <PhXCircle v-else-if="check.ok === false" weight="fill" class="size-5 shrink-0 text-error" />
          <PhMinusCircle v-else weight="fill" class="size-5 shrink-0 text-base-content/40" />
          <div class="min-w-0">
            <p class="font-medium break-words">{{ check.label }}</p>
            <p class="break-words text-base-content/70">{{ check.detail }}</p>
          </div>
        </li>
      </ul>
      <div
        v-for="err in [testError, saveError, removeError].filter(Boolean)"
        :key="err!.message"
        role="alert"
        class="alert alert-soft alert-error"
      >
        <PhWarningCircle class="size-5" />{{ err!.message }}
      </div>
    </div>

    <footer class="mt-6 flex flex-wrap items-center gap-2">
      <button v-if="arr" type="button" class="btn btn-ghost text-error" :disabled="removing" @click="forget(arr)">
        <PhTrash class="size-4" />Delete
      </button>
      <div class="ml-auto flex gap-2">
        <button type="button" class="btn" :disabled="testing" @click="submit((input) => test(input))">
          <span v-if="testing" class="loading loading-sm loading-spinner" />
          <PhPlugsConnected v-else class="size-4" />Test
        </button>
        <button type="submit" class="btn btn-primary" :disabled="saving">
          <span v-if="saving" class="loading loading-sm loading-spinner" />
          <PhCheck v-else weight="bold" class="size-4" />Save
        </button>
      </div>
    </footer>
  </form>
</template>
