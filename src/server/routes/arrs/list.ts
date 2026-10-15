import * as CopiesService from "../../services/copies.ts";
import * as HttpService from "../../services/http.ts";
import * as SettingsService from "../../services/settings.ts";

/**
 * Lists every saved Arr connection for the settings page, with how many local copies Tetharr has made for each and how
 * much space they take, so removing one can explain what happens to them.
 */
export const list = HttpService.handlers((c) => {
  const totals = CopiesService.totals();
  return c.json(
    SettingsService.arrs().map((arr) => ({
      ...arr,
      copies: totals.get(arr.id)?.count ?? 0,
      bytes: totals.get(arr.id)?.bytes ?? 0,
    })),
  );
});
