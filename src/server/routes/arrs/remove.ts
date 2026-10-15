import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import * as CopiesService from "../../services/copies.ts";
import * as HttpService from "../../services/http.ts";
import * as PinsService from "../../services/pins.ts";
import * as SettingsService from "../../services/settings.ts";
import { kick } from "../../worker.ts";

/**
 * Removes a connection, one of two ways. "restore" unpins everything and lets the worker undo every copy first,
 * removing the connection once it's done. "leave" removes it straight away: its copies stay on disk exactly as they
 * are, and Tetharr forgets them, so it never changes or deletes them again. With no copies, both remove it straight
 * away.
 */
export const remove = HttpService.handlers(
  HttpService.id,
  HttpService.valid("query", z.object({ mode: z.enum(["restore", "leave"]) })),
  (c) => {
    const { id } = c.req.valid("param");
    const { mode } = c.req.valid("query");
    if (!SettingsService.arrs().some((a) => a.id === id)) {
      throw new HTTPException(404, { message: "That connection no longer exists" });
    }

    // Unpin everything, and let the worker remove the connection once every copy has been undone
    if (mode === "restore" && CopiesService.list(id).length) {
      SettingsService.retire(id);
      PinsService.clear(id);
      kick();
      return c.json({ id, removed: false });
    }

    // Forget everything Tetharr knew about this connection. Its files stay exactly as they are
    PinsService.clear(id);
    CopiesService.clear(id);
    SettingsService.remove(id);
    return c.json({ id, removed: true });
  },
);
