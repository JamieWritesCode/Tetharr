import { HTTPException } from "hono/http-exception";
import * as ArrSchema from "../../../schemas/arr.ts";
import * as ArrService from "../../services/arr.ts";
import * as HttpService from "../../services/http.ts";

/**
 * Tries a connection before it's saved, so the settings page can confirm it works. Answers with the Arr's version, or
 * explains why it couldn't connect.
 */
export const test = HttpService.handlers(HttpService.valid("json", ArrSchema.input), async (c) => {
  const version = await ArrService.status(c.req.valid("json")).catch((err: Error) => {
    throw new HTTPException(502, { message: err.message });
  });
  return c.json({ version });
});
