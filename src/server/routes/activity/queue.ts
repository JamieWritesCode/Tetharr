import * as HttpService from "../../services/http.ts";
import { queue as upcoming } from "../../worker.ts";

/**
 * What the worker still has to do, in the order it will get there, worked out from the pins and the files as they are
 * now.
 */
export const queue = HttpService.handlers(async (c) => c.json({ steps: await upcoming() }));
