/**
 * Reading and changing the saved Arr connections.
 */

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import type { Input } from "../../schemas/arr.ts";
import * as ApiService from "./api.ts";

/**
 * How to fetch the saved connections, shared by every page that shows them.
 */
export const list = () =>
  queryOptions({ queryKey: ["arrs"], queryFn: () => ApiService.unwrap(ApiService.client.arrs.$get()) });

/**
 * The saved connections, kept up to date.
 */
export const useList = () => useQuery(list());

/**
 * Saves a connection, new or edited. Everything is refreshed afterwards, because a changed connection can change what
 * the library shows.
 */
export function useSave() {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number | undefined; input: Input }) =>
      id === undefined
        ? ApiService.unwrap(ApiService.client.arrs.$post({ json: input }))
        : ApiService.unwrap(ApiService.client.arrs[":id"].$put({ param: { id: String(id) }, json: input })),
    onSuccess: () => cache.invalidateQueries(),
  });
}

/**
 * Removes a connection, either undoing its copies first ("restore") or leaving its files as they are ("leave"), then
 * refreshes everything that depends on it.
 */
export function useRemove() {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: ({ id, mode }: { id: number; mode: "restore" | "leave" }) =>
      ApiService.unwrap(ApiService.client.arrs[":id"].$delete({ param: { id: String(id) }, query: { mode } })),
    onSuccess: () => cache.invalidateQueries(),
  });
}

/**
 * Tries a connection without saving it, answering with the Arr's version.
 */
export const useTest = () =>
  useMutation({ mutationFn: (input: Input) => ApiService.unwrap(ApiService.client.arrs.test.$post({ json: input })) });
