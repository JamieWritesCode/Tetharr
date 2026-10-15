import { HTTPException } from "hono/http-exception";
import * as ArrSchema from "../../../schemas/arr.ts";
import * as ChecksService from "../../services/checks.ts";
import * as HttpService from "../../services/http.ts";

/**
 * Tries a connection before it's saved, so the settings page can show whether it will work: that the Arr answers, that
 * Tetharr can see its library folders, and that its links can be followed. An Arr that can't be reached at all fails
 * the whole test.
 */
export const test = HttpService.handlers(HttpService.valid("json", ArrSchema.input), async (c) => {
  const checks = await ChecksService.run(c.req.valid("json")).catch((err: Error) => {
    throw new HTTPException(502, { message: err.message });
  });
  return c.json({ checks });
});
