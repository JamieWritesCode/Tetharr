import { HTTPException } from "hono/http-exception";
import * as ArrSchema from "../../../schemas/arr.ts";
import * as HttpService from "../../services/http.ts";
import * as SettingsService from "../../services/settings.ts";

/**
 * Replaces a saved Arr connection with the edited version.
 */
export const update = HttpService.handlers(HttpService.id, HttpService.valid("json", ArrSchema.input), (c) => {
  const arr = SettingsService.save(c.req.valid("json"), c.req.valid("param").id);
  if (!arr) throw new HTTPException(404, { message: "That connection no longer exists" });
  return c.json(arr);
});
