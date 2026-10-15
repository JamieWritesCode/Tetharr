/**
 * Reading the series library and one series with its episode files, and pinning or unpinning a whole series or one of
 * its seasons.
 */

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import type { MaybeRefOrGetter } from "vue";
import { toValue } from "vue";
import * as ApiService from "./api.ts";

/**
 * How to fetch every series from every Sonarr.
 */
export const list = () =>
  queryOptions({ queryKey: ["series"], queryFn: () => ApiService.unwrap(ApiService.client.series.$get()) });

/**
 * The series library, kept up to date.
 */
export const useList = () => useQuery(list());

/**
 * One series with every episode file and where each lives, kept up to date.
 */
export const useOne = (arr: MaybeRefOrGetter<number>, id: MaybeRefOrGetter<number>) =>
  useQuery({
    queryKey: ["series", arr, id],
    queryFn: () =>
      ApiService.unwrap(
        ApiService.client.series[":arr"][":id"].$get({ param: { arr: String(toValue(arr)), id: String(toValue(id)) } }),
      ),
  });

/**
 * Pins or unpins a whole series, or one season of it when given a season. Every series view is refreshed afterwards,
 * along with the worker's activity, since the worker starts on it straight away.
 */
export function usePin() {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: ({
      arr,
      id,
      season,
      pinned,
    }: {
      arr: number;
      id: number;
      season?: number | undefined;
      pinned: boolean;
    }): Promise<{ pinned: boolean }> => {
      const title = { arr: String(arr), id: String(id) };
      if (season === undefined) {
        const pin = ApiService.client.series[":arr"][":id"].pin;
        return pinned
          ? ApiService.unwrap(pin.$put({ param: title }))
          : ApiService.unwrap(pin.$delete({ param: title }));
      }
      const pin = ApiService.client.series[":arr"][":id"].seasons[":season"].pin;
      const param = { ...title, season: String(season) };
      return pinned ? ApiService.unwrap(pin.$put({ param })) : ApiService.unwrap(pin.$delete({ param }));
    },
    onSuccess: () =>
      cache.invalidateQueries({ queryKey: ["series"] }).then(() => cache.invalidateQueries({ queryKey: ["activity"] })),
  });
}
