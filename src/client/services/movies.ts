/**
 * Reading the movie library, and pinning or unpinning movies in it.
 */

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import * as ApiService from "./api.ts";

/**
 * How to fetch every movie from every Radarr, with where each file lives.
 */
export const list = () =>
  queryOptions({ queryKey: ["movies"], queryFn: () => ApiService.unwrap(ApiService.client.movies.$get()) });

/**
 * The movie library, kept up to date.
 */
export const useList = () => useQuery(list());

/**
 * Pins or unpins a movie. The library and the worker's activity are refreshed afterwards, since the worker starts on it
 * straight away.
 */
export function usePin() {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: ({ arr, id, pinned }: { arr: number; id: number; pinned: boolean }): Promise<{ pinned: boolean }> => {
      const param = { arr: String(arr), id: String(id) };
      const pin = ApiService.client.movies[":arr"][":id"].pin;
      return pinned ? ApiService.unwrap(pin.$put({ param })) : ApiService.unwrap(pin.$delete({ param }));
    },
    onSuccess: () =>
      cache.invalidateQueries({ queryKey: ["movies"] }).then(() => cache.invalidateQueries({ queryKey: ["activity"] })),
  });
}
