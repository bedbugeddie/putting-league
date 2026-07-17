import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest'
import { Position } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { calcLeagueNightTotals, detectTies, upsertScore } from './scoring.js'
import {
  resetDb,
  createDivision,
  createPlayer,
  createSeason,
  createLeagueNight,
  createHole,
  createRound,
  createScore,
  waitFor,
} from '../test/helpers.js'

beforeEach(async () => {
  await resetDb()
})

// upsertScore fires its audit-log write without awaiting it, so a truncate from the
// *next* test's resetDb() can race an in-flight write from this one and log a harmless
// (caught) FK error. Give it a beat to settle before we tear down.
afterEach(async () => {
  await new Promise(r => setTimeout(r, 100))
})

afterAll(async () => {
  await prisma.$disconnect()
})

async function setupNight(overrides?: Parameters<typeof createLeagueNight>[1]) {
  const division = await createDivision({ code: 'MPO' })
  const season = await createSeason()
  const leagueNight = await createLeagueNight(season.id, overrides)
  const hole1 = await createHole(leagueNight.id, 1)
  const hole2 = await createHole(leagueNight.id, 2)
  const round1 = await createRound(leagueNight.id, 1)
  return { division, season, leagueNight, hole1, hole2, round1 }
}

describe('calcLeagueNightTotals', () => {
  it('sums made + bonus per player across holes and positions', async () => {
    const { division, leagueNight, hole1, hole2, round1 } = await setupNight()
    const { player: p1 } = await createPlayer(division.id)

    await createScore({ playerId: p1.id, holeId: hole1.id, roundId: round1.id, position: Position.SHORT, made: 3 })
    await createScore({ playerId: p1.id, holeId: hole2.id, roundId: round1.id, position: Position.LONG, made: 2 })

    const totals = await calcLeagueNightTotals(leagueNight.id)
    expect(totals).toHaveLength(1)
    expect(totals[0]).toMatchObject({
      playerId: p1.id,
      totalMade: 5,
      totalBonus: 1, // one 3-for-3
      totalScore: 6,
      shortMade: 3,
      longMade: 2,
      perfectRounds: 1,
    })
  })

  it('sorts players by totalScore descending', async () => {
    const { division, leagueNight, hole1, round1 } = await setupNight()
    const { player: low } = await createPlayer(division.id, { name: 'Low' })
    const { player: high } = await createPlayer(division.id, { name: 'High' })

    await createScore({ playerId: low.id, holeId: hole1.id, roundId: round1.id, position: Position.SHORT, made: 1 })
    await createScore({ playerId: high.id, holeId: hole1.id, roundId: round1.id, position: Position.SHORT, made: 3 })

    const totals = await calcLeagueNightTotals(leagueNight.id)
    expect(totals.map(t => t.playerId)).toEqual([high.id, low.id])
  })

  it('only counts a bonus once per score row, not per made putt', async () => {
    const { division, leagueNight, hole1, hole2, round1 } = await setupNight()
    const { player } = await createPlayer(division.id)

    await createScore({ playerId: player.id, holeId: hole1.id, roundId: round1.id, position: Position.SHORT, made: 3 })
    await createScore({ playerId: player.id, holeId: hole2.id, roundId: round1.id, position: Position.SHORT, made: 3 })

    const totals = await calcLeagueNightTotals(leagueNight.id)
    expect(totals[0].totalBonus).toBe(2)
    expect(totals[0].perfectRounds).toBe(2)
    expect(totals[0].totalScore).toBe(8) // 6 made + 2 bonus
  })

  it('returns [] when the league night has no scores', async () => {
    const { leagueNight } = await setupNight()
    const totals = await calcLeagueNightTotals(leagueNight.id)
    expect(totals).toEqual([])
  })
})

describe('detectTies', () => {
  it('flags a tie for 1st within a division', async () => {
    const { division, leagueNight, hole1, round1 } = await setupNight()
    const { player: p1 } = await createPlayer(division.id, { name: 'A' })
    const { player: p2 } = await createPlayer(division.id, { name: 'B' })

    await createScore({ playerId: p1.id, holeId: hole1.id, roundId: round1.id, position: Position.SHORT, made: 2 })
    await createScore({ playerId: p2.id, holeId: hole1.id, roundId: round1.id, position: Position.SHORT, made: 2 })

    const ties = await detectTies(leagueNight.id)
    expect(ties).toHaveLength(1)
    expect(ties[0].divisionId).toBe(division.id)
    expect(ties[0].tied.map(t => t.playerId).sort()).toEqual([p1.id, p2.id].sort())
  })

  it('does not flag a division with a unique top score', async () => {
    const { division, leagueNight, hole1, round1 } = await setupNight()
    const { player: p1 } = await createPlayer(division.id)
    const { player: p2 } = await createPlayer(division.id)

    await createScore({ playerId: p1.id, holeId: hole1.id, roundId: round1.id, position: Position.SHORT, made: 3 })
    await createScore({ playerId: p2.id, holeId: hole1.id, roundId: round1.id, position: Position.SHORT, made: 1 })

    const ties = await detectTies(leagueNight.id)
    expect(ties).toEqual([])
  })

  it('does not flag a tie that is not for the top score', async () => {
    const { division, leagueNight, hole1, round1 } = await setupNight()
    const { player: p1 } = await createPlayer(division.id)
    const { player: p2 } = await createPlayer(division.id)
    const { player: p3 } = await createPlayer(division.id)

    await createScore({ playerId: p1.id, holeId: hole1.id, roundId: round1.id, position: Position.SHORT, made: 3 })
    await createScore({ playerId: p2.id, holeId: hole1.id, roundId: round1.id, position: Position.SHORT, made: 1 })
    await createScore({ playerId: p3.id, holeId: hole1.id, roundId: round1.id, position: Position.SHORT, made: 1 })

    const ties = await detectTies(leagueNight.id)
    expect(ties).toEqual([])
  })

  it('scopes ties per division — a tie in one division does not affect another', async () => {
    const { leagueNight, hole1, round1 } = await setupNight()
    const divA = await createDivision({ code: 'A' })
    const divB = await createDivision({ code: 'B' })
    const { player: a1 } = await createPlayer(divA.id)
    const { player: a2 } = await createPlayer(divA.id)
    const { player: b1 } = await createPlayer(divB.id)
    const { player: b2 } = await createPlayer(divB.id)

    // Division A: tied for 1st
    await createScore({ playerId: a1.id, holeId: hole1.id, roundId: round1.id, position: Position.SHORT, made: 2 })
    await createScore({ playerId: a2.id, holeId: hole1.id, roundId: round1.id, position: Position.SHORT, made: 2 })
    // Division B: clear winner
    await createScore({ playerId: b1.id, holeId: hole1.id, roundId: round1.id, position: Position.SHORT, made: 3 })
    await createScore({ playerId: b2.id, holeId: hole1.id, roundId: round1.id, position: Position.SHORT, made: 0 })

    const ties = await detectTies(leagueNight.id)
    expect(ties).toHaveLength(1)
    expect(ties[0].divisionId).toBe(divA.id)
  })
})

describe('upsertScore', () => {
  it('creates a score and sets bonus=true for a 3-for-3', async () => {
    const { division, hole1, round1 } = await setupNight()
    const { player, user } = await createPlayer(division.id)

    const score = await upsertScore({
      playerId: player.id,
      holeId: hole1.id,
      roundId: round1.id,
      position: Position.SHORT,
      made: 3,
      enteredBy: user.id,
    })

    expect(score.made).toBe(3)
    expect(score.bonus).toBe(true)
  })

  it('does not set bonus for made < 3', async () => {
    const { division, hole1, round1 } = await setupNight()
    const { player, user } = await createPlayer(division.id)

    const score = await upsertScore({
      playerId: player.id,
      holeId: hole1.id,
      roundId: round1.id,
      position: Position.SHORT,
      made: 2,
      enteredBy: user.id,
    })

    expect(score.bonus).toBe(false)
  })

  it('upserts — a second call for the same player/hole/round/position updates in place', async () => {
    const { division, hole1, round1 } = await setupNight()
    const { player, user } = await createPlayer(division.id)

    const first = await upsertScore({
      playerId: player.id, holeId: hole1.id, roundId: round1.id,
      position: Position.SHORT, made: 1, enteredBy: user.id,
    })
    const second = await upsertScore({
      playerId: player.id, holeId: hole1.id, roundId: round1.id,
      position: Position.SHORT, made: 3, enteredBy: user.id,
    })

    expect(second.id).toBe(first.id)
    expect(second.made).toBe(3)
    expect(second.bonus).toBe(true)

    const count = await prisma.score.count({ where: { playerId: player.id } })
    expect(count).toBe(1)
  })

  it('rejects made > 3', async () => {
    const { division, hole1, round1 } = await setupNight()
    const { player, user } = await createPlayer(division.id)

    await expect(upsertScore({
      playerId: player.id, holeId: hole1.id, roundId: round1.id,
      position: Position.SHORT, made: 4, enteredBy: user.id,
    })).rejects.toThrow('made must be between 0 and 3')
  })

  it('rejects made < 0', async () => {
    const { division, hole1, round1 } = await setupNight()
    const { player, user } = await createPlayer(division.id)

    await expect(upsertScore({
      playerId: player.id, holeId: hole1.id, roundId: round1.id,
      position: Position.SHORT, made: -1, enteredBy: user.id,
    })).rejects.toThrow('made must be between 0 and 3')
  })

  it('writes an audit log entry recording prevMade → newMade', async () => {
    const { leagueNight, division, hole1, round1 } = await setupNight()
    const { player, user } = await createPlayer(division.id)

    await upsertScore({
      playerId: player.id, holeId: hole1.id, roundId: round1.id,
      position: Position.SHORT, made: 1, enteredBy: user.id,
    })
    await upsertScore({
      playerId: player.id, holeId: hole1.id, roundId: round1.id,
      position: Position.SHORT, made: 3, enteredBy: user.id,
    })

    // Audit writes are fire-and-forget (do not block upsertScore's response), so poll for them.
    const logs = await waitFor(async () => {
      const rows = await prisma.scoreAuditLog.findMany({
        where: { leagueNightId: leagueNight.id },
      })
      return rows.length === 2 ? rows : null
    })

    const sorted = logs.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    expect(sorted[0]).toMatchObject({ prevMade: null, newMade: 1 })
    expect(sorted[1]).toMatchObject({ prevMade: 1, newMade: 3 })
  })
})
