/**
 * The colour theme: follow the system's light or dark setting, or always use one. The choice is remembered in this
 * browser only. index.html applies a saved choice before the page draws.
 */

import { ref, watchEffect } from "vue";

export type Choice = "system" | "light" | "dark";

const KEY = "tetharr.theme";

// Read the saved choice. Browser storage can be unavailable (private windows, blocked storage), so fall back to the
// system
const saved = (() => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
})();
const choice = ref<Choice>(saved === "light" || saved === "dark" ? saved : "system");

// Apply the choice and remember it. Following the system means naming no theme, so the stylesheet picks one by itself
watchEffect(() => {
  if (choice.value === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = `tetharr-${choice.value}`;
  try {
    localStorage.setItem(KEY, choice.value);
  } catch {}
});

/**
 * The current theme choice, shared by every component that shows or changes it.
 */
export const useTheme = () => ({ choice });
