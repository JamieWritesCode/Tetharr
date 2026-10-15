import * as HttpService from "../../services/http.ts";
import * as SettingsService from "../../services/settings.ts";

/**
 * The pinning options, for the settings page.
 */
export const options = HttpService.handlers((c) => c.json(SettingsService.options()));
