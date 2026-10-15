/**
 * What a saved Arr connection (one Radarr or Sonarr) looks like. The server checks every save against these rules, and
 * the settings page uses the same ones, so the two can never disagree.
 */

import { z } from "zod";

/**
 * One path translation. The Arr and Tetharr usually run in separate containers, so the same file can have a different
 * path in each. `from` is how the path starts in the Arr, and `to` is what Tetharr sees in its place.
 */
export const mapping = z.object({
  from: z.string().trim().min(1, "Enter the path as the Arr sees it"),
  to: z.string().trim().min(1, "Enter the path as Tetharr sees it"),
});

/**
 * Everything needed to talk to one Arr: which kind it is, a name to show for it, its address, its API key, and how to
 * translate the paths it reports.
 */
export const input = z.object({
  type: z.enum(["radarr", "sonarr"]),
  name: z.string().trim().min(1, "Give the connection a name"),
  url: z.url("Enter the full address, like http://radarr:7878"),
  api_key: z.string().trim().min(1, "Enter the API key from the Arr's Settings → General"),
  path_mappings: z.array(mapping),
});

export type Mapping = z.infer<typeof mapping>;
export type Input = z.infer<typeof input>;
/**
 * A saved connection. `removing` is set while Tetharr undoes its copies before removing the connection.
 */
export type Arr = Input & { id: number; removing: boolean };
