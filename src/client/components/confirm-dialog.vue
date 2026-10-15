<script setup lang="ts">
/**
 * The confirmation dialog: what will happen, step by step, what it means for the user, and the ways to go ahead. With
 * one way to go ahead it shows a confirm button. With several, each is a card explaining what it does.
 */

import { PhCheckCircle, PhInfo, PhWarning, PhWarningOctagon } from "@phosphor-icons/vue";
import { nextTick, ref, watch } from "vue";
import * as ConfirmService from "../services/confirm.ts";

const { pending } = ConfirmService.usePending();
const dialog = ref<HTMLDialogElement>();

// The icon and colour for each kind of consequence
const TONES = {
  success: { icon: PhCheckCircle, color: "text-success" },
  info: { icon: PhInfo, color: "text-info" },
  warning: { icon: PhWarning, color: "text-warning" },
  error: { icon: PhWarningOctagon, color: "text-error" },
};

// Open the dialog when a question arrives, and close it once it's answered
watch(pending, async (value) => {
  await nextTick();
  if (value) dialog.value?.showModal();
  else dialog.value?.close();
});
</script>

<template>
  <dialog ref="dialog" class="modal modal-bottom sm:modal-middle" @close="ConfirmService.answer(undefined)">
    <div v-if="pending" class="modal-box max-w-lg">
      <h2 class="text-lg font-semibold">{{ pending.question.title }}</h2>
      <p v-if="pending.question.summary" class="mt-1 text-sm text-base-content/70">{{ pending.question.summary }}</p>

      <section v-if="pending.question.steps?.length" class="mt-5">
        <h3 class="text-xs font-semibold tracking-wide text-base-content/50 uppercase">What will happen</h3>
        <ol class="mt-2 flex flex-col gap-2">
          <li v-for="(step, i) in pending.question.steps" :key="i" class="flex gap-3 text-sm">
            <span class="grid size-5 shrink-0 place-items-center rounded-full bg-base-200 font-mono text-xs">
              {{ i + 1 }}
            </span>
            {{ step }}
          </li>
        </ol>
      </section>

      <section v-if="pending.question.consequences?.length" class="mt-5">
        <h3 class="text-xs font-semibold tracking-wide text-base-content/50 uppercase">What this means</h3>
        <ul class="mt-2 flex flex-col gap-2">
          <li v-for="(item, i) in pending.question.consequences" :key="i" class="flex gap-3 text-sm">
            <component :is="TONES[item.tone].icon" class="size-5 shrink-0" :class="TONES[item.tone].color" />
            {{ item.text }}
          </li>
        </ul>
      </section>

      <!-- Several ways to go ahead: one card each, explaining what it does -->
      <div v-if="pending.question.choices.length > 1" class="mt-6 flex flex-col gap-3">
        <button
          v-for="choice in pending.question.choices"
          :key="choice.value"
          type="button"
          class="flex flex-col items-start gap-1 rounded-box border border-base-300 p-4 text-left transition-colors hover:border-primary"
          :class="{ 'hover:border-error': choice.tone === 'error' }"
          @click="ConfirmService.answer(choice.value)"
        >
          <span class="font-medium" :class="choice.tone === 'error' ? 'text-error' : 'text-primary'">
            {{ choice.label }}
          </span>
          <span v-if="choice.detail" class="text-sm text-base-content/70">{{ choice.detail }}</span>
        </button>
        <button type="button" class="btn self-end btn-ghost" @click="ConfirmService.answer(undefined)">Cancel</button>
      </div>

      <footer v-else class="mt-6 flex justify-end gap-2">
        <button type="button" class="btn btn-ghost" @click="ConfirmService.answer(undefined)">Cancel</button>
        <button
          v-for="choice in pending.question.choices"
          :key="choice.value"
          type="button"
          class="btn"
          :class="choice.tone === 'error' ? 'btn-error' : 'btn-primary'"
          @click="ConfirmService.answer(choice.value)"
        >
          {{ choice.label }}
        </button>
      </footer>
    </div>
    <form method="dialog" class="modal-backdrop"><button>Close</button></form>
  </dialog>
</template>
