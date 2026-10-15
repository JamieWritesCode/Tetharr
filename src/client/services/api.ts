/**
 * The browser's connection to Tetharr's API. Every request goes through here, so the API's types and its error messages
 * work the same way everywhere.
 */

import { hc } from "hono/client";
import type { App } from "../../server/app.ts";

/**
 * Every API route as a typed function, e.g. `client.arrs.$get()`.
 */
export const client = hc<App>(location.origin).api;

/**
 * Waits for a request and returns its data. If the server refused, throws the server's own message so the page can show
 * the user what went wrong.
 */
export async function unwrap<R extends Response & { json(): Promise<unknown> }>(
  pending: Promise<R>,
): Promise<Awaited<ReturnType<R["json"]>>> {
  const res = await pending;
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (HTTP ${res.status})`);
  }
  return res.json() as Promise<Awaited<ReturnType<R["json"]>>>;
}
