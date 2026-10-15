/**
 * Tetharr's log. Each entry is one line of JSON, so log tools can filter by its fields (which Arr, which title, which
 * path).
 */

const write =
  (level: string) =>
  (msg: string, fields: object = {}) =>
    console.log(JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields }));

/**
 * Records something that happened as expected.
 */
export const info = write("info");

/**
 * Records something that went wrong and needs a person to look at it.
 */
export const error = write("error");
