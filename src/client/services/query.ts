/**
 * The browser's cache of data from the server. Pages read through it, so the same data isn't fetched twice and the
 * screen refreshes itself when the data is likely to have changed.
 */

import { QueryClient } from "@tanstack/vue-query";

export const cache = new QueryClient({
  defaultOptions: {
    // Treat data as fresh for 10 seconds, and retry a failed request once before showing the error
    queries: { staleTime: 10_000, retry: 1 },
  },
});
