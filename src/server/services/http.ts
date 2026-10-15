/**
 * Shared building blocks for the API's route handlers, so every route checks its input and reports errors the same way.
 */

import { zValidator } from "@hono/zod-validator";
import { createFactory } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

/**
 * Wraps a route handler, plus any input checks that run before it, so the route table in app.ts can use it and the
 * browser code still knows the exact shape of its request and response.
 */
export const handlers = createFactory().createHandlers;

/**
 * Checks part of a request (its body, its URL parameters, ...) against a schema before the handler runs. A request that
 * fails gets a 400 with a readable message, in the same `{ error }` form as every other API error.
 */
export const valid = <T extends z.ZodType, K extends "json" | "param" | "query">(target: K, schema: T) =>
  zValidator(target, schema, (result) => {
    if (!result.success) throw new HTTPException(400, { message: z.prettifyError(result.error) });
  });

/**
 * Reads the numeric id from addresses like /api/arrs/3, turning away anything that isn't one.
 */
export const id = valid("param", z.object({ id: z.coerce.number().int().positive() }));

/**
 * Reads which title an address like /api/movies/1/42 means: the Arr's id, then the title's id in that Arr.
 */
export const title = valid(
  "param",
  z.object({ arr: z.coerce.number().int().positive(), id: z.coerce.number().int().positive() }),
);
