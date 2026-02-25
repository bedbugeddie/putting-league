import { prisma } from '../lib/prisma.js'
import { Position } from '@prisma/client'
import { PlayerTotals } from '../types/index.js'

/**
 * Calculate a player's total score for a league night.
 * Score = sum of all `made` values + bonus points.
 * Bonus = 1 extra point for a 3-for-3 (already stored in Score.bonus).
 */
export async function calcLeagueNightTotals(leagueNightId: string): Promise<PlayerTotals[]> {
  // Pull all scores for this league night in one query
  const scores = await prisma.score.findMany({
    where: { hole: { leagueNightId } },
    include: {
      player: {
        include: { user: true, division: true },
      },
      hole: true,
      round: true,
    },
  })

  const totalsMap = new Map<string, PlayerTotals>()

  for (const score of scores) {
    const { player, position, made, bonus } = score
    const key = player.id

    if (!totalsMap.has(key)) {
      totalsMap.set(key, {
        playerId: player.id,
        playerName: player.user.name,
        divisionId: player.divisionId!,
        divisionCode: player.division!.code,
        totalMade: 0,
        totalBonus: 0,
        totalScore: 0,
        shortMade: 0,
        longMade: 0,
        perfectRounds: 0,
      })
    }

    const t = totalsMap.get(key)!
    t.totalMade += made
    t.totalBonus += bonus ? 1 : 0
    t.totalScore = t.totalMade + t.totalBonus

    if (position === Position.SHORT) t.shortMade += made
    if (position === Position.LONG) t.longMade += made
    if (bonus) t.perfectRounds += 1
  }

  return Array.from(totalsMap.values()).sort((a, b) => b.totalScore - a.totalScore)
}

/**
 * Detect ties within a division for a league night.
 * Returns groups of tied players at the top (1st place ties only for putt-off).
 */
export async function detectTies(leagueNightId: string) {
  const totals = await calcLeagueNightTotals(leagueNightId)

  // Group by division
  const byDivision = new Map<string, PlayerTotals[]>()
  for (const t of totals) {
    if (!byDivision.has(t.divisionId)) byDivision.set(t.divisionId, [])
    byDivision.get(t.divisionId)!.push(t)
  }

  const ties: { divisionId: string; divisionCode: string; tied: PlayerTotals[] }[] = []

  for (const [divisionId, players] of byDivision.entries()) {
    if (players.length < 2) continue
    const topScore = players[0].totalScore
    const tiedPlayers = players.filter(p => p.totalScore === topScore)
    if (tiedPlayers.length > 1) {
      ties.push({ divisionId, divisionCode: tiedPlayers[0].divisionCode, tied: tiedPlayers })
    }
  }

  return ties
}

/**
 * Compute rotation: given N holes and M total stations,
 * return what hole each station index should be at for a given round.
 * Players rotate forward one hole each round, wrapping around.
 */
export function computeStationHole(stationIndex: number, roundNumber: number, totalHoles: number): number {
  return ((stationIndex + roundNumber - 1) % totalHoles) + 1
}

/**
 * Record a score (upsert). Also computes and stores bonus flag.
 */
export async function upsertScore(params: {
  playerId: string
  holeId: string
  roundId: string
  position: Position
  made: number
  enteredBy: string
}) {
  const { playerId, holeId, roundId, position, made, enteredBy } = params

  if (made < 0 || made > 3) throw new Error('made must be between 0 and 3')

  const bonus = made === 3

  return prisma.score.upsert({
    where: { playerId_holeId_roundId_position: { playerId, holeId, roundId, position } },
    create: { playerId, holeId, roundId, position, made, bonus, enteredBy },
    update: { made, bonus, enteredBy },
  })
}
