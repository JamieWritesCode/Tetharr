import * as HttpService from "../../services/http.ts";
import * as PinsService from "../../services/pins.ts";
import { kick } from "../../worker.ts";

/**
 * Unpins a whole series, or one season of it, so the worker undoes Tetharr's copies of its episodes. The worker starts
 * straight away rather than at its next pass.
 */
export const unpin = HttpService.handlers(HttpService.season, (c) => {
  const { arr, id, season } = c.req.valid("param");
  PinsService.remove(arr, id, season);
  kick();
  return c.json({ pinned: false });
});
