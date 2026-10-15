import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import * as ArrService from "../../services/arr.ts";
import * as CopiesService from "../../services/copies.ts";
import * as FilesService from "../../services/files.ts";
import * as HttpService from "../../services/http.ts";
import * as SettingsService from "../../services/settings.ts";

/**
 * Settles a copy of a title the Arr no longer lists. "keep" leaves the file where it is and forgets it, so it becomes
 * an unmanaged local file. "delete" deletes it. Either way Tetharr stops tracking it.
 */
export const resolve = HttpService.handlers(
  HttpService.valid("json", z.object({ path: z.string(), action: z.enum(["keep", "delete"]) })),
  async (c) => {
    const { path, action } = c.req.valid("json");
    const copy = CopiesService.find(path);
    if (!copy) throw new HTTPException(404, { message: "Tetharr has no copy at that path" });

    if (action === "delete") {
      // Only for titles the Arr no longer lists: deleting a listed one's copy would leave it missing without a re-grab
      const arr = SettingsService.arrs().find((a) => a.id === copy.arr);
      const titles = arr && (arr.type === "radarr" ? await ArrService.movies(arr) : await ArrService.series(arr));
      if (arr && titles?.some((t) => t.id === copy.media)) {
        throw new HTTPException(409, { message: `${arr.name} still lists this title. Unpin it instead` });
      }

      // Safety: never delete a file Tetharr didn't create. Only a file that still matches the recorded copy is deleted
      if ((await FilesService.check(copy)) !== "copy") {
        throw new HTTPException(409, {
          message: "This file has changed since Tetharr copied it, so it won't be deleted",
        });
      }
      await FilesService.remove(copy);
    }
    CopiesService.remove(path);
    return c.json({ path, action });
  },
);
