import { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma.js'
import { requireAdmin } from '../../middleware/auth.js'
import { calcLeagueNightTotals } from '../../services/scoring.js'

// Payout percentages indexed by tier:
//   [0] = 0 players, [1] = 1-3, [2] = 4-6, [3] = 7-9,
//   [4] = 10-12, [5] = 13-15, [6] = 16+
const PAYOUT_TIERS: number[][] = [
  [],
  [1.000],
  [0.625, 0.375],
  [0.475, 0.300, 0.225],
  [0.410, 0.260, 0.190, 0.140],
  [0.360, 0.245, 0.170, 0.125, 0.100],
  [0.330, 0.230, 0.155, 0.120, 0.095, 0.070],
]

export function getPayoutPercentages(count: number): number[] {
  if (count === 0) return []
  if (count <= 3) return PAYOUT_TIERS[1]
  if (count <= 6) return PAYOUT_TIERS[2]
  if (count <= 9) return PAYOUT_TIERS[3]
  if (count <= 12) return PAYOUT_TIERS[4]
  if (count <= 15) return PAYOUT_TIERS[5]
  return PAYOUT_TIERS[6]
}

type RankedPlayer = { playerId: string; playerName: string; totalScore: number }

export interface PayoutEntry {
  place: number
  playerId: string
  playerName: string
  totalScore: number
  payout: number
  isTied: boolean
  pendingPuttOff: boolean // tie that hasn't been resolved by putt-off yet
}

/**
 * Calculate payouts for a division. In SPLIT mode ties split the prize money.
 * In PUTT_OFF mode, tied players are flagged as pending a putt-off resolution.
 * The puttOffWinnerId, if provided, resolves a 1st-place tie.
 */
export function calcDivisionPayouts(
  pool: number,
  rankedPlayers: RankedPlayer[],
  tieBreakerMode: string,
  puttOffWinnerId?: string | null,
): PayoutEntry[] {
  if (rankedPlayers.length === 0) return []

  const count = rankedPlayers.length
  const percentages = getPayoutPercentages(count)

  // Group consecutive players with the same score
  const groups: RankedPlayer[][] = []
  for (let i = 0; i < rankedPlayers.length; ) {
    const score = rankedPlayers[i].totalScore
    const group: RankedPlayer[] = []
    while (i < rankedPlayers.length && rankedPlayers[i].totalScore === score) {
      group.push(rankedPlayers[i++])
    }
    groups.push(group)
  }

  // Compute combined prize amount per group (before remainder adjustment)
  let placeOffset = 0
  const groupAmounts: { group: RankedPlayer[]; combinedAmount: number }[] = []

  for (const group of groups) {
    const pctSlice = percentages.slice(placeOffset, placeOffset + group.length)
    const combinedPct = pctSlice.reduce((a, b) => a + b, 0)
    groupAmounts.push({ group, combinedAmount: Math.round(pool * combinedPct) })
    placeOffset += group.length
  }

  // Adjust last paid group so total exactly equals pool (handles rounding drift)
  let lastPaidIdx = -1
  for (let i = groupAmounts.length - 1; i >= 0; i--) {
    if (groupAmounts[i].combinedAmount > 0) { lastPaidIdx = i; break }
  }
  if (lastPaidIdx >= 0) {
    const othersTotal = groupAmounts
      .slice(0, lastPaidIdx)
      .reduce((sum, ga) => sum + ga.combinedAmount, 0)
    groupAmounts[lastPaidIdx].combinedAmount = pool - othersTotal
  }

  // Build result entries
  const result: PayoutEntry[] = []
  placeOffset = 0

  for (const { group, combinedAmount } of groupAmounts) {
    const isTied = group.length > 1

    if (isTied && combinedAmount > 0) {
      if (tieBreakerMode === 'SPLIT') {
        // Split prize evenly; last tied player absorbs any rounding remainder
        const baseAmount = Math.floor(combinedAmount / group.length)
        const remainder = combinedAmount - baseAmount * group.length
        for (let i = 0; i < group.length; i++) {
          result.push({
            place: placeOffset + 1,
            playerId: group[i].playerId,
            playerName: group[i].playerName,
            totalScore: group[i].totalScore,
            payout: i === group.length - 1 ? baseAmount + remainder : baseAmount,
            isTied: true,
            pendingPuttOff: false,
          })
          placeOffset++
        }
      } else {
        // PUTT_OFF mode: resolve if we have a winner, otherwise mark as pending
        const winner = puttOffWinnerId
          ? group.find(p => p.playerId === puttOffWinnerId)
          : null

        for (const p of group) {
          const isWinner = winner?.playerId === p.playerId
          result.push({
            place: placeOffset + 1,
            playerId: p.playerId,
            playerName: p.playerName,
            totalScore: p.totalScore,
            payout: winner ? (isWinner ? combinedAmount : 0) : 0,
            isTied: true,
            pendingPuttOff: !winner,
          })
          placeOffset++
        }
      }
    } else {
      // No tie, or $0 place
      for (const p of group) {
        result.push({
          place: placeOffset + 1,
          playerId: p.playerId,
          playerName: p.playerName,
          totalScore: p.totalScore,
          payout: combinedAmount,
          isTied: false,
          pendingPuttOff: false,
        })
        placeOffset++
      }
    }
  }

  return result
}

export async function payoutRoutes(app: FastifyInstance) {
  app.get('/admin/league-nights/:id/payouts', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string }

    const leagueNight = await prisma.leagueNight.findUnique({
      where: { id },
      select: { tieBreakerMode: true },
    })
    if (!leagueNight) return reply.status(404).send({ error: 'Not found' })

    // Fetch check-ins with division entry fee
    const checkIns = await prisma.checkIn.findMany({
      where: { leagueNightId: id },
      include: {
        player: { include: { user: true, division: true } },
      },
    })

    // Fetch any resolved putt-offs for this night
    const puttOffs = await prisma.puttOff.findMany({
      where: { leagueNightId: id },
      select: { divisionId: true, winnerId: true },
    })
    const puttOffWinners = new Map(puttOffs.map(p => [p.divisionId, p.winnerId]))

    // All player totals (scores) for this night
    const allTotals = await calcLeagueNightTotals(id)

    // Group check-ins by division
    type DivEntry = {
      divisionId: string
      divisionCode: string
      divisionName: string
      entryFee: number
      sortOrder: number
      checkedInCount: number
      paidPlayerIds: Set<string>
    }
    const divMap = new Map<string, DivEntry>()

    for (const ci of checkIns) {
      const div = ci.player.division
      if (!div) continue

      if (!divMap.has(div.id)) {
        divMap.set(div.id, {
          divisionId: div.id,
          divisionCode: div.code,
          divisionName: div.name,
          entryFee: div.entryFee,
          sortOrder: div.sortOrder,
          checkedInCount: 0,
          paidPlayerIds: new Set(),
        })
      }
      const entry = divMap.get(div.id)!
      entry.checkedInCount++
      if (ci.hasPaid) entry.paidPlayerIds.add(ci.playerId)
    }

    const divisions = []
    for (const [, div] of divMap.entries()) {
      const paidCount = div.paidPlayerIds.size
      const pool = Math.round(paidCount * div.entryFee)
      const percentages = getPayoutPercentages(paidCount)

      // Only rank paid players for payout purposes
      const rankedPlayers = allTotals
        .filter(t => div.paidPlayerIds.has(t.playerId))
        .sort((a, b) => b.totalScore - a.totalScore)

      const puttOffWinnerId = puttOffWinners.get(div.divisionId) ?? null
      const payouts = calcDivisionPayouts(
        pool,
        rankedPlayers,
        leagueNight.tieBreakerMode,
        puttOffWinnerId,
      )

      divisions.push({
        divisionId: div.divisionId,
        divisionCode: div.divisionCode,
        divisionName: div.divisionName,
        entryFee: div.entryFee,
        sortOrder: div.sortOrder,
        checkedInCount: div.checkedInCount,
        paidCount,
        pool,
        percentages,
        payouts,
      })
    }

    divisions.sort((a, b) => a.sortOrder - b.sortOrder || a.divisionCode.localeCompare(b.divisionCode))

    return reply.send({ tieBreakerMode: leagueNight.tieBreakerMode, divisions })
  })

  // Public endpoint: get payout info for the leaderboard (which players are in the money)
  app.get('/league-nights/:id/payouts', async (req, reply) => {
    const { id } = req.params as { id: string }

    const leagueNight = await prisma.leagueNight.findUnique({
      where: { id },
      select: { tieBreakerMode: true },
    })
    if (!leagueNight) return reply.status(404).send({ error: 'Not found' })

    const checkIns = await prisma.checkIn.findMany({
      where: { leagueNightId: id },
      include: { player: { include: { division: true } } },
    })

    const puttOffs = await prisma.puttOff.findMany({
      where: { leagueNightId: id },
      select: { divisionId: true, winnerId: true },
    })
    const puttOffWinners = new Map(puttOffs.map(p => [p.divisionId, p.winnerId]))

    const allTotals = await calcLeagueNightTotals(id)

    // For each paid player, compute their payout
    const paidByDivision = new Map<string, { entryFee: number; playerIds: Set<string> }>()
    for (const ci of checkIns) {
      const div = ci.player.division
      if (!div || !ci.hasPaid) continue
      if (!paidByDivision.has(div.id)) {
        paidByDivision.set(div.id, { entryFee: div.entryFee, playerIds: new Set() })
      }
      paidByDivision.get(div.id)!.playerIds.add(ci.playerId)
    }

    // Map playerId -> payout amount
    const payoutMap = new Map<string, { payout: number; place: number; pool: number; isTied: boolean; pendingPuttOff: boolean }>()

    for (const [divId, { entryFee, playerIds }] of paidByDivision.entries()) {
      const paidCount = playerIds.size
      const pool = Math.round(paidCount * entryFee)
      const rankedPlayers = allTotals
        .filter(t => playerIds.has(t.playerId))
        .sort((a, b) => b.totalScore - a.totalScore)

      const puttOffWinnerId = puttOffWinners.get(divId) ?? null
      const payouts = calcDivisionPayouts(pool, rankedPlayers, leagueNight.tieBreakerMode, puttOffWinnerId)

      for (const p of payouts) {
        if (p.payout > 0 || p.pendingPuttOff) {
          payoutMap.set(p.playerId, { payout: p.payout, place: p.place, pool, isTied: p.isTied, pendingPuttOff: p.pendingPuttOff })
        }
      }
    }

    return reply.send({ payouts: Object.fromEntries(payoutMap.entries()) })
  })
}
