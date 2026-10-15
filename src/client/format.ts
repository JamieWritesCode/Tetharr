/**
 * Turning raw numbers into what people read.
 */

/**
 * A size in gigabytes, the unit that makes sense for films and episodes.
 */
export const size = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} GB`;
