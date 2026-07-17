import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { FastifyInstance } from 'fastify'
import { Position } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { buildTestApp, signToken, authHeader } from '../test/app.js'
import {
  resetDb,
  createDivision,
  createPlayer,
  createSeason,
  createLeagueNight,
  createHole,
  createRound,
} from '../test/helpers.js'

let app: FastifyInstance

beforeAll(async () => {
  app = await buildTestApp()
  await app.ready()
})

beforeEach(async () => {
  await resetDb()
})

afterAll(async () => {
  await app.close()
  await prisma.$disconnect()
})

async function setupNight() {
  const division = await createDivision({ code: 'MPO' })
  const season = await createSeason()
  const leagueNight = await createLeagueNight(season.id)
  const hole1 = await createHole(leagueNight.id, 1)
  const round1 = await createRound(leagueNight.id, 1)
  const { user, player } = await createPlayer(division.id)
  const token = signToken(app, { userId: user.id, email: user.email, isAdmin: false })
  return { division, leagueNight, hole1, round1, user, player, token }
}

describe('POST /scoring/score', () => {
  it('requires authentication', async () => {
    const res = await app.inject({ method: 'POST', url: '/scoring/score', payload: {} })
    expect(res.statusCode).toBe(401)
  })

  it('creates a score and reports bonus for a 3-for-3', async () => {
    const { hole1, round1, player, user, token } = await setupNight()

    const res = await app.inject({
      method: 'POST',
      url: '/scoring/score',
      headers: authHeader(token),
      payload: { playerId: player.id, holeId: hole1.id, roundId: round1.id, position: Position.SHORT, made: 3 },
    })

    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.score.made).toBe(3)
    expect(body.score.bonus).toBe(true)

    const row = await prisma.score.findUniqueOrThrow({ where: { id: body.score.id } })
    expect(row.enteredBy).toBe(user.id)
  })

  it('returns a raw 500 for out-of-range `made` instead of a 400 (no zod error handler is registered)', async () => {
    // Documents a real bug, not the desired behavior: scoreSchema.parse(req.body) throws a
    // ZodError synchronously, and since no app.setErrorHandler() exists anywhere in the app,
    // Fastify's default handler treats it as an unhandled 500 and dumps the raw Zod issue
    // array into `message`. The frontend (api/client.ts) reads body.error for its toast text,
    // which here is the generic "Internal Server Error" — not a helpful validation message —
    // and this shows up as a server error in logs/monitoring for what is actually bad client
    // input. This affects every zod-validated route in the app, not just this one.
    const { hole1, round1, player, token } = await setupNight()

    const res = await app.inject({
      method: 'POST',
      url: '/scoring/score',
      headers: authHeader(token),
      payload: { playerId: player.id, holeId: hole1.id, roundId: round1.id, position: Position.SHORT, made: 7 },
    })

    expect(res.statusCode).toBe(500)
    expect(res.json().error).toBe('Internal Server Error')
  })

  it('upserting the same player/hole/round/position again updates rather than duplicates', async () => {
    const { hole1, round1, player, token } = await setupNight()
    const payload = { playerId: player.id, holeId: hole1.id, roundId: round1.id, position: Position.SHORT, made: 1 }

    await app.inject({ method: 'POST', url: '/scoring/score', headers: authHeader(token), payload })
    const second = await app.inject({
      method: 'POST', url: '/scoring/score', headers: authHeader(token),
      payload: { ...payload, made: 3 },
    })

    expect(second.statusCode).toBe(201)
    expect(second.json().score.made).toBe(3)

    const count = await prisma.score.count({ where: { playerId: player.id } })
    expect(count).toBe(1)
  })
})

describe('POST /scoring/bulk', () => {
  it('creates multiple scores in one call', async () => {
    const { division, leagueNight, hole1, round1, token } = await setupNight()
    const { player: p2 } = await createPlayer(division.id)

    const res = await app.inject({
      method: 'POST',
      url: '/scoring/bulk',
      headers: authHeader(token),
      payload: {
        scores: [
          { playerId: p2.id, holeId: hole1.id, roundId: round1.id, position: Position.SHORT, made: 2 },
          { playerId: p2.id, holeId: hole1.id, roundId: round1.id, position: Position.LONG, made: 1 },
        ],
      },
    })

    expect(res.statusCode).toBe(200)
    const count = await prisma.score.count({ where: { hole: { leagueNightId: leagueNight.id } } })
    expect(count).toBe(2)
  })

  it('made:null deletes an existing score row (undo)', async () => {
    const { hole1, round1, player, token } = await setupNight()

    await app.inject({
      method: 'POST', url: '/scoring/score', headers: authHeader(token),
      payload: { playerId: player.id, holeId: hole1.id, roundId: round1.id, position: Position.SHORT, made: 2 },
    })
    expect(await prisma.score.count({ where: { playerId: player.id } })).toBe(1)

    const res = await app.inject({
      method: 'POST', url: '/scoring/bulk', headers: authHeader(token),
      payload: { scores: [{ playerId: player.id, holeId: hole1.id, roundId: round1.id, position: Position.SHORT, made: null }] },
    })

    expect(res.statusCode).toBe(200)
    expect(await prisma.score.count({ where: { playerId: player.id } })).toBe(0)
  })
})

describe('POST /scoring/rounds/:id/complete', () => {
  it('marks a round complete', async () => {
    const { round1, token } = await setupNight()

    const res = await app.inject({
      method: 'POST', url: `/scoring/rounds/${round1.id}/complete`, headers: authHeader(token),
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().round.isComplete).toBe(true)
  })
})

describe('GET /league-nights/:id/scores', () => {
  it('returns previously entered scores for the night', async () => {
    const { leagueNight, hole1, round1, player, token } = await setupNight()

    await app.inject({
      method: 'POST', url: '/scoring/score', headers: authHeader(token),
      payload: { playerId: player.id, holeId: hole1.id, roundId: round1.id, position: Position.SHORT, made: 2 },
    })

    const res = await app.inject({ method: 'GET', url: `/league-nights/${leagueNight.id}/scores` })
    expect(res.statusCode).toBe(200)
    expect(res.json().scores).toHaveLength(1)
  })
})

describe('putt-off routes', () => {
  it('creates a putt-off, then records a round that resolves it', async () => {
    const { division, leagueNight, token } = await setupNight()
    const { player: p1 } = await createPlayer(division.id)
    const { player: p2 } = await createPlayer(division.id)

    const createRes = await app.inject({
      method: 'POST',
      url: `/scoring/league-nights/${leagueNight.id}/putt-off`,
      headers: authHeader(token),
      payload: { divisionId: division.id, playerIds: [p1.id, p2.id] },
    })
    expect(createRes.statusCode).toBe(201)
    const puttOffId = createRes.json().puttOff.id

    const roundRes = await app.inject({
      method: 'POST',
      url: `/scoring/putt-offs/${puttOffId}/round`,
      headers: authHeader(token),
      payload: { scores: [{ playerId: p1.id, made: 3 }, { playerId: p2.id, made: 1 }] },
    })
    expect(roundRes.statusCode).toBe(200)
    expect(roundRes.json().result).toEqual({ winnerId: p1.id, stillTied: false })

    const puttOff = await prisma.puttOff.findUniqueOrThrow({ where: { id: puttOffId } })
    expect(puttOff.winnerId).toBe(p1.id)
  })
})
