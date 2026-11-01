/**
 * Tetharr's log. Each entry is one line of JSON, so log tools can filter by its fields (which Arr, which title, which
 * path). The most recent entries are also kept in memory for the diagnostics bundle.
 */

// How many recent entries are kept, since the log itself only goes to the container's output
const KEEP = 1000;
const kept: object[] = [];

const write =
  (level: string) =>
  (msg: string, fields: object = {}) => {
    // Print the entry, and keep it, dropping the oldest once there are too many
    const entry = { time: new Date().toISOString(), level, msg, ...fields };
    console.log(JSON.stringify(entry));
    if (kept.push(entry) > KEEP) kept.shift();
  };

/**
 * Records something that happened as expected.
 */
export const info = write("info");

/**
 * Records something that went wrong and needs a person to look at it.
 */
export const error = write("error");

/**
 * The most recent entries, oldest first, for the diagnostics bundle.
 */
export const recent = () => [...kept];
