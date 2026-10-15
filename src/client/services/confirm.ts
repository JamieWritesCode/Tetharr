/**
 * Asks the user to confirm an action before it happens, spelling out what will happen and what it means. Any part of
 * the interface can ask and wait for the answer. One dialog for the whole app (components/confirm-dialog.vue) shows
 * whichever question is waiting.
 */

import { shallowRef } from "vue";

/**
 * One way to go ahead, with an optional line explaining exactly what it does. `error` marks one that loses something.
 */
export interface Choice {
  value: string;
  label: string;
  detail?: string;
  tone?: "primary" | "error";
}

/**
 * Everything the dialog explains: a title, an optional summary, the steps that will happen in order, what they mean for
 * the user (each marked as good news, information, a caution or a loss), and the ways to go ahead.
 */
export interface Question {
  title: string;
  summary?: string;
  steps?: string[];
  consequences?: { tone: "success" | "info" | "warning" | "error"; text: string }[];
  choices: Choice[];
}

const pending = shallowRef<{ question: Question; resolve: (value: string | undefined) => void }>();

/**
 * Shows a question and waits for the answer: the chosen value, or nothing if the user cancels.
 */
export function ask(question: Question): Promise<string | undefined> {
  // A new question replaces any unanswered one, which counts as cancelled
  pending.value?.resolve(undefined);
  return new Promise((resolve) => (pending.value = { question, resolve }));
}

/**
 * Answers the waiting question and closes it. Called by the dialog.
 */
export function answer(value: string | undefined): void {
  pending.value?.resolve(value);
  pending.value = undefined;
}

/**
 * The question waiting for an answer, if any, for the dialog to show.
 */
export const usePending = () => ({ pending });
