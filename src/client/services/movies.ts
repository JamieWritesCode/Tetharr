/**
 * Reading the movie library and one movie, pinning or unpinning movies, and the label each movie shows. The grid and a
 * movie's own page share these, so they always agree.
 */

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import type { MaybeRefOrGetter } from "vue";
import { toValue } from "vue";
import { size } from "../format.ts";
import * as ActivityService from "./activity.ts";
import * as ApiService from "./api.ts";
import * as ConfirmService from "./confirm.ts";
import * as SettingsService from "./settings.ts";

const load = () => ApiService.unwrap(ApiService.client.movies.$get());

/**
 * A movie as the library lists it: its details, where its file lives, and whether it's pinned.
 */
export type Movie = Awaited<ReturnType<typeof load>>["movies"][number];

/**
 * How to fetch every movie from every Radarr, with where each file lives.
 */
export const list = () => queryOptions({ queryKey: ["movies"], queryFn: load });

/**
 * The movie library, kept up to date.
 */
export const useList = () => useQuery(list());

/**
 * One movie and where its file lives, kept up to date.
 */
export const useOne = (arr: MaybeRefOrGetter<number>, id: MaybeRefOrGetter<number>) =>
  useQuery({
    queryKey: ["movies", arr, id],
    queryFn: () =>
      ApiService.unwrap(
        ApiService.client.movies[":arr"][":id"].$get({ param: { arr: String(toValue(arr)), id: String(toValue(id)) } }),
      ),
  });

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

/**
 * Pins or unpins a movie. Unpinning that will delete the copy and leave the movie missing until Radarr downloads it
 * again asks first. Unpinning that just puts the link back is instant and harmless, so it doesn't.
 */
export function useToggle() {
  const { mutate, error } = usePin();
  const { data: options } = SettingsService.useOptions();

  async function toggle(movie: Movie) {
    if (movie.pinned && movie.managed && (options.value?.unpin === "regrab" || !movie.restorable)) {
      const choice = await ConfirmService.ask({
        title: `Unpin ${movie.title}?`,
        summary:
          options.value?.unpin === "regrab"
            ? "Unpinning is set to always re-grab."
            : "Its streamed file is gone, so the link can't be restored.",
        steps: [`Delete Tetharr's local copy (${size(movie.size)})`, "Ask Radarr to download it again"],
        consequences: [
          { tone: "warning", text: `${movie.title} is missing until Radarr downloads it again.` },
          { tone: "success", text: `Frees ${size(movie.size)} of local space.` },
        ],
        choices: [{ value: "unpin", label: "Unpin and re-grab", tone: "error" }],
      });
      if (!choice) return;
    }
    mutate({ arr: movie.arr, id: movie.id, pinned: !movie.pinned });
  }
  return { toggle, error };
}

/**
 * The label for a movie: what the worker is doing to it right now (with how far a copy has got), whether it's waiting
 * for the worker, or else where its file lives.
 */
export function useBadge() {
  const { data: activity } = ActivityService.useStatus();

  function badge(movie: Movie) {
    const current = activity.value?.current;
    if (current?.arr === movie.arr && current.media === movie.id) {
      const progress = current.progress;
      return {
        state: current.action,
        detail: progress?.size ? `${Math.floor((progress.done / progress.size) * 100)}%` : undefined,
      };
    }
    if ((movie.pinned && movie.state === "streamed") || (!movie.pinned && movie.managed)) {
      return { state: "queued" as const };
    }
    if (movie.state === "local" && !movie.managed) return { state: "unmanaged" as const };
    return { state: movie.state };
  }
  return { badge };
}

/**
 * Whether a movie can be pinned or unpinned. A movie with no file has nothing to copy, and a local file Tetharr didn't
 * create can never be unpinned, so neither can be pinned (unless it's already pinned, so it can be unpinned).
 */
export const pinnable = (movie: Movie) =>
  movie.pinned || (movie.state !== "none" && !(movie.state === "local" && !movie.managed));
