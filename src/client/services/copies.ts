/**
 * Settling Tetharr's copies of titles an Arr no longer lists: keeping the file as an unmanaged one, or deleting it.
 */

import { useMutation, useQueryClient } from "@tanstack/vue-query";
import * as ApiService from "./api.ts";

/**
 * Keeps or deletes a copy, then refreshes the library.
 */
export function useResolve() {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (json: { path: string; action: "keep" | "delete" }) =>
      ApiService.unwrap(ApiService.client.copies.resolve.$post({ json })),
    onSuccess: () => cache.invalidateQueries({ queryKey: ["movies"] }),
  });
}
