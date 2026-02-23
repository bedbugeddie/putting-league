/**
 * Compute which hole number a player on `stationIndex` (0-based)
 * should be playing during `roundNumber` (1-based).
 *
 * Players rotate forward one hole each round, wrapping around.
 * e.g. 6 holes, station 0, round 1 → hole 1
 *      6 holes, station 0, round 2 → hole 2
 *      6 holes, station 5, round 2 → hole 1 (wraps)
 */
export function computeStationHole(
  stationIndex: number,
  roundNumber: number,
  totalHoles: number
): number {
  return ((stationIndex + roundNumber - 1) % totalHoles) + 1
}
