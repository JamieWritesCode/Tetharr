/**
 * The diagnostics bundle, which the browser downloads straight from the API as a file.
 */

import * as ApiService from "./api.ts";

/**
 * The address of the bundle, for a download link.
 */
export const url = ApiService.client.diagnostics.$url().href;
