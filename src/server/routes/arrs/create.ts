import * as ArrSchema from "../../../schemas/arr.ts";
import * as HttpService from "../../services/http.ts";
import * as SettingsService from "../../services/settings.ts";

/**
 * Saves a new Arr connection.
 */
export const create = HttpService.handlers(HttpService.valid("json", ArrSchema.input), (c) =>
  c.json(SettingsService.save(c.req.valid("json"))!, 201),
);
