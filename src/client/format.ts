/**
 * Turning raw numbers into what people read.
 */

/**
 * A size in gigabytes, the unit that makes sense for films and episodes.
 */
export const size = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} GB`;

/**
 * A moment as a short date and time in the browser's own locale, such as "1 Nov, 14:03".
 */
export const time = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
