/**
 * The college football season in progress on a given date. A season runs from
 * August through the January bowls, so January to July still belong to the
 * previous year's season.
 */
export function currentSeason(now = new Date()): number {
  return now.getMonth() < 7 ? now.getFullYear() - 1 : now.getFullYear();
}
