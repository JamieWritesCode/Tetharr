/**
 * Reading and saving the pinning options. Each setting saves on its own as soon as it changes, so every settings row
 * behaves the same way: checked with the server's rules, saved, then briefly marked as saved.
 */

import { queryOptions, useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, ref } from "vue";
import * as SettingsSchema from "../../schemas/settings.ts";
import type { Options } from "../../schemas/settings.ts";
import * as ApiService from "./api.ts";

/**
 * How to fetch the pinning options.
 */
export const options = () =>
  queryOptions({ queryKey: ["settings"], queryFn: () => ApiService.unwrap(ApiService.client.settings.$get()) });

/**
 * The pinning options, kept up to date.
 */
export const useOptions = () => useQuery(options());

/**
 * One setting: its current value, a way to save a new one, and how saving is going (saving, saved, or failed with an
 * error) for its settings row to show.
 */
export function useSetting<K extends keyof Options>(key: K) {
  const { data } = useOptions();
  const cache = useQueryClient();
  const state = ref<"idle" | "saving" | "saved" | "error">("idle");
  const error = ref<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Saves a new value. A value that breaks the server's rules isn't sent, and its problem is shown instead.
   */
  async function save(value: Options[K]) {
    // Check the value with the same rules the server uses
    const result = SettingsSchema.options.shape[key].safeParse(value);
    if (!result.success) {
      state.value = "error";
      error.value = result.error.issues[0]?.message;
      return;
    }

    // Save just this setting, then show it as saved for a couple of seconds
    state.value = "saving";
    error.value = undefined;
    try {
      const saved = await ApiService.unwrap(ApiService.client.settings.$patch({ json: { [key]: result.data } }));
      cache.setQueryData(["settings"], saved);
      state.value = "saved";
      clearTimeout(timer);
      timer = setTimeout(() => state.value === "saved" && (state.value = "idle"), 2000);
    } catch (err) {
      state.value = "error";
      error.value = (err as Error).message;
    }
  }

  return { value: computed(() => data.value?.[key]), save, state, error };
}
