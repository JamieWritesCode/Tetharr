/**
 * The settings that control how Tetharr pins and unpins, as the settings page saves them. Each has a default, so a
 * setting that has never been saved still has a value, and adding a new setting never needs a database migration.
 */

import { z } from "zod";

/**
 * How much free space must be left on the library's disk after every copy, and what happens to a copy when its title
 * is unpinned: put the original link back (instant, when the streamed file is still there), or always ask the Arr to
 * download it again.
 */
export const options = z.object({
  reserve_gb: z.number("Enter a number of gigabytes").min(0, "Can't be negative"),
  unpin: z.enum(["restore", "regrab"]),
});

export type Options = z.infer<typeof options>;

export const defaults: Options = { reserve_gb: 50, unpin: "restore" };
