import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { prisma } from '../lib/prisma.js'
import { createPuttOff, recordPuttOffRound } from './tiebreaker.js'
import {
  resetDb,
  createDivision,
  createPlayer,
  createSeason,
  createLeagueNight,
} from '../test/helpers.js'

beforeEach(async () => {
  await resetDb()
})

afterAll(async () => {
  await prisma.$disconnect()
})

async function setupDivisionAndNight() {
  const division = await createDivision()
  const season = await createSeason()
  const leagueNight = await createLeagueNight(season.id)
  return { division, leagueNight }
}

describe('createPuttOff', () => {
  it('creates a putt-off at round 1 with one participant per player, made defaulted to 0', async () => {
    const { division, leagueNight } = await setupDivisionAndNight()
    const { player: p1 } = await createPlayer(division.id)
    const { player: p2 } = await createPlayer(division.id)

    const puttOff = await createPuttOff(leagueNight.id, division.id, [p1.id, p2.id])

    expect(puttOff.round).toBe(1)
    expect(puttOff.winnerId).toBeNull()
    expect(puttOff.participants).toHaveLength(2)
    expect(puttOff.participants.every(p => p.made === 0 && p.round === 1)).toBe(true)
    expect(puttOff.participants.map(p => p.playerId).sort()).toEqual([p1.id, p2.id].sort())
  })
})

describe('recordPuttOffRound', () => {
  it('declares a winner when one player has a strictly higher score', async () => {
    const { division, leagueNight } = await setupDivisionAndNight()
    const { player: p1 } = await createPlayer(division.id)
    const { player: p2 } = await createPlayer(division.id)
    const puttOff = await createPuttOff(leagueNight.id, division.id, [p1.id, p2.id])

    const result = await recordPuttOffRound(puttOff.id, [
      { playerId: p1.id, made: 3 },
      { playerId: p2.id, made: 1 },
    ])

    expect(result).toEqual({ winnerId: p1.id, stillTied: false })

    const updated = await prisma.puttOff.findUniqueOrThrow({ where: { id: puttOff.id } })
    expect(updated.winnerId).toBe(p1.id)
    expect(updated.round).toBe(1) // round does not advance once there's a winner
  })

  it('advances to the next round with only the tied players when scores are still tied', async () => {
    const { division, leagueNight } = await setupDivisionAndNight()
    const { player: p1 } = await createPlayer(division.id)
    const { player: p2 } = await createPlayer(division.id)
    const { player: p3 } = await createPlayer(division.id)
    const puttOff = await createPuttOff(leagueNight.id, division.id, [p1.id, p2.id, p3.id])

    const result = await recordPuttOffRound(puttOff.id, [
      { playerId: p1.id, made: 2 },
      { playerId: p2.id, made: 2 },
      { playerId: p3.id, made: 0 },
    ])

    expect(result.stillTied).toBe(true)
    expect(result.winnerId).toBeNull()
    expect(result.tiedPlayerIds?.sort()).toEqual([p1.id, p2.id].sort())

    const updated = await prisma.puttOff.findUniqueOrThrow({
      where: { id: puttOff.id },
      include: { participants: true },
    })
    expect(updated.round).toBe(2)
    expect(updated.winnerId).toBeNull()

    // Round 2 participants exist only for the still-tied players
    const round2 = updated.participants.filter(p => p.round === 2)
    expect(round2.map(p => p.playerId).sort()).toEqual([p1.id, p2.id].sort())
    expect(round2.every(p => p.made === 0)).toBe(true)

    // p3 (eliminated) has no round-2 entry
    expect(updated.participants.some(p => p.playerId === p3.id && p.round === 2)).toBe(false)
  })

  it('resolves a multi-round putt-off: tie in round 1, winner in round 2', async () => {
    const { division, leagueNight } = await setupDivisionAndNight()
    const { player: p1 } = await createPlayer(division.id)
    const { player: p2 } = await createPlayer(division.id)
    const puttOff = await createPuttOff(leagueNight.id, division.id, [p1.id, p2.id])

    const round1Result = await recordPuttOffRound(puttOff.id, [
      { playerId: p1.id, made: 1 },
      { playerId: p2.id, made: 1 },
    ])
    expect(round1Result.stillTied).toBe(true)

    const round2Result = await recordPuttOffRound(puttOff.id, [
      { playerId: p1.id, made: 3 },
      { playerId: p2.id, made: 0 },
    ])
    expect(round2Result).toEqual({ winnerId: p1.id, stillTied: false })

    const final = await prisma.puttOff.findUniqueOrThrow({ where: { id: puttOff.id } })
    expect(final.winnerId).toBe(p1.id)
    expect(final.round).toBe(2)
  })

  it('records made and bonus for every participant in the round, not just the winner', async () => {
    const { division, leagueNight } = await setupDivisionAndNight()
    const { player: p1 } = await createPlayer(division.id)
    const { player: p2 } = await createPlayer(division.id)
    const puttOff = await createPuttOff(leagueNight.id, division.id, [p1.id, p2.id])

    await recordPuttOffRound(puttOff.id, [
      { playerId: p1.id, made: 3 },
      { playerId: p2.id, made: 1 },
    ])

    const participants = await prisma.puttOffParticipant.findMany({
      where: { puttOffId: puttOff.id, round: 1 },
    })
    const p1Row = participants.find(p => p.playerId === p1.id)!
    const p2Row = participants.find(p => p.playerId === p2.id)!
    expect(p1Row).toMatchObject({ made: 3, bonus: true })
    expect(p2Row).toMatchObject({ made: 1, bonus: false })
  })
})
