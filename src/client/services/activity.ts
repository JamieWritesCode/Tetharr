/**
 * What the worker is doing right now, checked every second while it's busy and every few seconds otherwise, plus what
 * it still has to do and what it has done.
 */

import { useInfiniteQuery, useQuery } from "@tanstack/vue-query";
import * as ApiService from "./api.ts";

/**
 * The worker's current activity, how far a copy has got, and the problems from its last pass.
 */
export const useStatus = () =>
  useQuery({
    queryKey: ["activity"],
    queryFn: () => ApiService.unwrap(ApiService.client.activity.$get()),
    refetchInterval: (query) => (query.state.data?.current ? 1000 : 5000),
  });

/**
 * What the worker still has to do, in the order it will get there. Checked every few seconds while it's shown, since
 * working it out asks each Arr about the titles with something to do.
 */
export const useQueue = () =>
  useQuery({
    queryKey: ["activity", "queue"],
    queryFn: () => ApiService.unwrap(ApiService.client.activity.queue.$get()),
    refetchInterval: 5000,
  });

/**
 * What the worker has done, newest first, a page at a time.
 */
export const useHistory = () =>
  useInfiniteQuery({
    queryKey: ["activity", "history"],
    queryFn: ({ pageParam }) =>
      ApiService.unwrap(
        ApiService.client.activity.history.$get({ query: pageParam ? { before: String(pageParam) } : {} }),
      ),
    initialPageParam: 0,
    getNextPageParam: (page) => page.next,
  });

/**
 * The page of a title the worker is working on, has worked on or will work on. Only a series' files have a season,
 * which tells the two apart, and a series' page opens at that season.
 */
export const to = ({ arr, media, season }: { arr: number; media: number; season: number | null }) =>
  season === null ? `/movies/${arr}/${media}` : `/series/${arr}/${media}#season-${season}`;
