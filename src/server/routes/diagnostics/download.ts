import * as DiagnosticsService from "../../services/diagnostics.ts";
import * as HttpService from "../../services/http.ts";
import { status } from "../../worker.ts";

/**
 * Downloads the diagnostics bundle as a file named for today, ready to attach to a bug report.
 */
export const download = HttpService.handlers(async (c) =>
  c.body(await DiagnosticsService.build(status()), 200, {
    "Content-Type": "application/json",
    "Content-Disposition": `attachment; filename="tetharr-diagnostics-${new Date().toISOString().slice(0, 10)}.json"`,
  }),
);
