import { z } from "zod";
import * as HistoryService from "../../services/history.ts";
import * as HttpService from "../../services/http.ts";

/**
 * One page of what the worker has done, newest first. `before` asks for the page after an earlier one.
 */
export const history = HttpService.handlers(
  HttpService.valid("query", z.object({ before: z.coerce.number().int().positive().optional() })),
  (c) => c.json(HistoryService.list(c.req.valid("query").before)),
);
