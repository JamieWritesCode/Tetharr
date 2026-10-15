import * as SettingsSchema from "../../../schemas/settings.ts";
import * as HttpService from "../../services/http.ts";
import * as SettingsService from "../../services/settings.ts";

/**
 * Saves one or more pinning options, leaving the others as they are, so two settings saved at once can't overwrite
 * each other.
 */
export const update = HttpService.handlers(HttpService.valid("json", SettingsSchema.options.partial()), (c) =>
  c.json(SettingsService.update(c.req.valid("json"))),
);
