import * as HttpService from "../../services/http.ts";
import * as PinsService from "../../services/pins.ts";
import { kick } from "../../worker.ts";

/**
 * Unpins a movie, so the worker undoes Tetharr's copy of it. The worker starts straight away rather than at its next
 * pass.
 */
export const unpin = HttpService.handlers(HttpService.title, (c) => {
  const { arr, id } = c.req.valid("param");
  PinsService.remove(arr, id);
  kick();
  return c.json({ pinned: false });
});
