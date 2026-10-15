/**
 * What the worker is doing right now, checked every second while it's busy and every few seconds otherwise.
 */

import { useQuery } from "@tanstack/vue-query";
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
