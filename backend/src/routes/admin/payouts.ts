import { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma.js'
import { requireAdmin } from '../../middleware/auth.js'
import { calcLeagueNightTotals } from '../../services/scoring.js'
import { getSettings } from './settings.js'

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

  // Compute combined prize amount per group. Tied players share the sum of the consecutive
  // prize slots their group occupies (e.g. 2-way tie for 1st shares slots 1+2).
  // placeOffset advances by group.length so each group consumes the right slice of percentages.
  let placeOffset = 0
  const groupAmounts: { group: RankedPlayer[]; combinedAmount: number }[] = []

  for (const group of groups) {
    const pctSlice = percentages.slice(placeOffset, placeOffset + group.length)
    const combinedPct = pctSlice.reduce((a, b) => a + b, 0)
    groupAmounts.push({ group, combinedAmount: Math.floor(pool * combinedPct) })
    placeOffset += group.length
  }
  // Note: flooring means sum(groupAmounts) ≤ pool; the difference flows to EOY at the call site.

  // Build result entries using dense ranking: each unique score group gets the next
  // sequential rank (1, 1, 2, 2, 3) rather than standard competition ranking (1, 1, 3, 3, 5).
  // Payout amounts are still calculated from the combined prize slots the group occupies.
  const result: PayoutEntry[] = []
  let denseRank = 0

  for (const { group, combinedAmount } of groupAmounts) {
    const isTied = group.length > 1
    denseRank++

    if (isTied && combinedAmount > 0) {
      if (tieBreakerMode === 'SPLIT') {
        // Split prize evenly; each player gets floored amount — remainder flows to EOY
        const baseAmount = Math.floor(combinedAmount / group.length)
        for (const p of group) {
          result.push({
            place: denseRank,
            playerId: p.playerId,
            playerName: p.playerName,
            totalScore: p.totalScore,
            payout: baseAmount,
            isTied: true,
            pendingPuttOff: false,
          })
        }
      } else {
        // PUTT_OFF mode: resolve if we have a winner, otherwise mark as pending
        const winner = puttOffWinnerId
          ? group.find(p => p.playerId === puttOffWinnerId)
          : null

        for (const p of group) {
          const isWinner = winner?.playerId === p.playerId
          result.push({
            place: denseRank,
            playerId: p.playerId,
            playerName: p.playerName,
            totalScore: p.totalScore,
            payout: winner ? (isWinner ? combinedAmount : 0) : 0,
            isTied: true,
            pendingPuttOff: !winner,
          })
        }
      }
    } else {
      // No tie, or $0 place
      for (const p of group) {
        result.push({
          place: denseRank,
          playerId: p.playerId,
          playerName: p.playerName,
          totalScore: p.totalScore,
          payout: combinedAmount,
          isTied: isTied,
          pendingPuttOff: false,
        })
      }
    }
  }

  return result
}

export async function payoutRoutes(app: FastifyInstance) {
  app.get('/admin/league-nights/:id/payouts', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string }

    const [leagueNight, settings] = await Promise.all([
      prisma.leagueNight.findUnique({ where: { id }, select: { tieBreakerMode: true } }),
      getSettings(),
    ])
    if (!leagueNight) return reply.status(404).send({ error: 'Not found' })

    const { housePerEntry, eoyPerEntry } = settings

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
      const paidCount       = div.paidPlayerIds.size
      const grossCollected  = Math.round(paidCount * div.entryFee)
      const houseTotal      = paidCount * housePerEntry
      const eoyBase         = paidCount * eoyPerEntry
      const pool            = Math.max(0, grossCollected - houseTotal - eoyBase)
      const percentages     = getPayoutPercentages(paidCount)

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

      // Cents not paid out (from floor-rounding) roll into EOY
      const payoutRemainder = pool - payouts.reduce((sum, p) => sum + p.payout, 0)
      const eoyTotal        = eoyBase + payoutRemainder

      divisions.push({
        divisionId: div.divisionId,
        divisionCode: div.divisionCode,
        divisionName: div.divisionName,
        entryFee: div.entryFee,
        sortOrder: div.sortOrder,
        checkedInCount: div.checkedInCount,
        paidCount,
        grossCollected,
        houseTotal,
        eoyTotal,
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

    const [leagueNight, settings] = await Promise.all([
      prisma.leagueNight.findUnique({ where: { id }, select: { tieBreakerMode: true } }),
      getSettings(),
    ])
    if (!leagueNight) return reply.status(404).send({ error: 'Not found' })

    const { housePerEntry, eoyPerEntry } = settings

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
      const paidCount      = playerIds.size
      const grossCollected = Math.round(paidCount * entryFee)
      const pool           = Math.max(0, grossCollected - paidCount * housePerEntry - paidCount * eoyPerEntry)
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

  // Season-level financial summary: house, EOY, and payout pool totals per night + season aggregate
  app.get('/admin/seasons/active/financials', { preHandler: requireAdmin }, async (_req, reply) => {
    const [season, settings] = await Promise.all([
      prisma.season.findFirst({ where: { isActive: true }, select: { id: true, name: true } }),
      getSettings(),
    ])

    const { housePerEntry, eoyPerEntry } = settings

    if (!season) return reply.send({
      season: null, nights: [], totals: { paidCount: 0, grossCollected: 0, houseTotal: 0, eoyTotal: 0, payoutPool: 0, payoutRemainder: 0 },
      settings,
    })

    // Fetch all league nights for the season (ordered chronologically)
    const nights = await prisma.leagueNight.findMany({
      where: { seasonId: season.id },
      select: { id: true, date: true, status: true },
      orderBy: { date: 'asc' },
    })

    // Single query: all paid check-ins for the season, grouped by night AND division so we
    // can compute per-division floor rounding accurately via getPayoutPercentages.
    const paidCheckIns = await prisma.checkIn.findMany({
      where: { leagueNight: { seasonId: season.id }, hasPaid: true },
      select: { leagueNightId: true, player: { select: { division: { select: { id: true, entryFee: true } } } } },
    })

    // Build per-night per-division aggregate
    const nightDivAgg = new Map<string, Map<string, { paidCount: number; grossCollected: number }>>()
    for (const ci of paidCheckIns) {
      const divId = ci.player.division?.id ?? '__none__'
      const fee   = ci.player.division?.entryFee ?? 0
      if (!nightDivAgg.has(ci.leagueNightId)) nightDivAgg.set(ci.leagueNightId, new Map())
      const divMap = nightDivAgg.get(ci.leagueNightId)!
      const cur    = divMap.get(divId) ?? { paidCount: 0, grossCollected: 0 }
      divMap.set(divId, { paidCount: cur.paidCount + 1, grossCollected: cur.grossCollected + fee })
    }

    // Compute the floor rounding that rolls into EOY for a given night.
    // This is the no-tie approximation: each percentage slot is individually floored.
    // Actual rounding may be slightly higher when ties split a group further.
    function calcPayoutRemainder(nightId: string): number {
      const divMap = nightDivAgg.get(nightId)
      if (!divMap) return 0
      let total = 0
      for (const { paidCount, grossCollected } of divMap.values()) {
        const pool = Math.max(0, grossCollected - paidCount * housePerEntry - paidCount * eoyPerEntry)
        const pcts = getPayoutPercentages(paidCount)
        const theoretical = pcts.reduce((sum, pct) => sum + Math.floor(pool * pct), 0)
        total += pool - theoretical
      }
      return total
    }

    // Roll up per-night totals
    const nightAgg = new Map<string, { paidCount: number; grossCollected: number }>()
    for (const [nightId, divMap] of nightDivAgg.entries()) {
      let paidCount = 0, grossCollected = 0
      for (const d of divMap.values()) { paidCount += d.paidCount; grossCollected += d.grossCollected }
      nightAgg.set(nightId, { paidCount, grossCollected })
    }

    const nightResults = nights.map(n => {
      const agg            = nightAgg.get(n.id) ?? { paidCount: 0, grossCollected: 0 }
      const houseTotal     = agg.paidCount * housePerEntry
      const eoyTotal       = agg.paidCount * eoyPerEntry
      const payoutPool     = Math.max(0, agg.grossCollected - houseTotal - eoyTotal)
      const payoutRemainder = calcPayoutRemainder(n.id)
      return { nightId: n.id, date: n.date, status: n.status, paidCount: agg.paidCount, grossCollected: agg.grossCollected, houseTotal, eoyTotal, payoutPool, payoutRemainder }
    })

    const totals = nightResults.reduce(
      (acc, n) => ({
        paidCount:        acc.paidCount        + n.paidCount,
        grossCollected:   acc.grossCollected   + n.grossCollected,
        houseTotal:       acc.houseTotal       + n.houseTotal,
        eoyTotal:         acc.eoyTotal         + n.eoyTotal,
        payoutPool:       acc.payoutPool       + n.payoutPool,
        payoutRemainder:  acc.payoutRemainder  + n.payoutRemainder,
      }),
      { paidCount: 0, grossCollected: 0, houseTotal: 0, eoyTotal: 0, payoutPool: 0, payoutRemainder: 0 },
    )

    return reply.send({ season, nights: nightResults, totals, settings })
  })
}
