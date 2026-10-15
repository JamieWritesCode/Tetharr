import * as FilesService from "../../services/files.ts";
import * as HttpService from "../../services/http.ts";
import { status as worker } from "../../worker.ts";

/**
 * What the worker is doing right now, with how far a copy has got, plus the problems from its last pass and when it
 * will try again.
 */
export const status = HttpService.handlers(async (c) => {
  const { current, errors, last, next } = worker();
  return c.json({ current: current && { ...current, progress: await FilesService.progress() }, errors, last, next });
});
