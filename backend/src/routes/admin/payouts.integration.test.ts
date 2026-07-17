import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { FastifyInstance } from 'fastify'
import { Position } from '@prisma/client'
import { prisma } from '../../lib/prisma.js'
import { buildTestApp, signToken, authHeader } from '../../test/app.js'
import {
  resetDb,
  createDivision,
  createPlayer,
  createSeason,
  createLeagueNight,
  createHole,
  createRound,
  createScore,
  createCheckIn,
} from '../../test/helpers.js'

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

function adminToken() {
  return signToken(app, { userId: 'admin-user', email: 'admin@example.com', isAdmin: true })
}
function playerToken(userId = 'regular-user') {
  return signToken(app, { userId, email: 'player@example.com', isAdmin: false })
}

/**
 * Sets up: default Settings (housePerEntry=1, eoyPerEntry=2 — the getSettings() defaults),
 * one division with entryFee=10, three paid check-ins, and distinct scores (30/20/10) so
 * there are no ties. 3 paid players lands in the 1-slot payout tier (winner takes all).
 */
async function setupPayoutScenario() {
  const division = await createDivision({ code: 'MPO', entryFee: 10 })
  const season = await createSeason()
  const leagueNight = await createLeagueNight(season.id)
  const hole1 = await createHole(leagueNight.id, 1)
  const round1 = await createRound(leagueNight.id, 1)

  const { player: p1 } = await createPlayer(division.id, { name: 'Winner' })
  const { player: p2 } = await createPlayer(division.id, { name: 'Second' })
  const { player: p3 } = await createPlayer(division.id, { name: 'Third' })

  for (const [player, made] of [[p1, 3], [p2, 2], [p3, 1]] as const) {
    await createScore({ playerId: player.id, holeId: hole1.id, roundId: round1.id, position: Position.SHORT, made })
  }
  // p1: 3 made (bonus) = 4pts, p2: 2pts, p3: 1pt — distinct, no ties

  await createCheckIn({ leagueNightId: leagueNight.id, playerId: p1.id, divisionId: division.id, hasPaid: true })
  await createCheckIn({ leagueNightId: leagueNight.id, playerId: p2.id, divisionId: division.id, hasPaid: true })
  await createCheckIn({ leagueNightId: leagueNight.id, playerId: p3.id, divisionId: division.id, hasPaid: true })

  return { division, season, leagueNight, p1, p2, p3 }
}

describe('GET /admin/league-nights/:id/payouts', () => {
  it('requires authentication', async () => {
    const { leagueNight } = await setupPayoutScenario()
    const res = await app.inject({ method: 'GET', url: `/admin/league-nights/${leagueNight.id}/payouts` })
    expect(res.statusCode).toBe(401)
  })

  it('requires admin — a regular authenticated user is forbidden', async () => {
    const { leagueNight } = await setupPayoutScenario()
    const res = await app.inject({
      method: 'GET',
      url: `/admin/league-nights/${leagueNight.id}/payouts`,
      headers: authHeader(playerToken()),
    })
    expect(res.statusCode).toBe(403)
  })

  it('computes pool, house/EOY cut, and winner-take-all payout end to end', async () => {
    const { leagueNight, division, p1, p2, p3 } = await setupPayoutScenario()

    const res = await app.inject({
      method: 'GET',
      url: `/admin/league-nights/${leagueNight.id}/payouts`,
      headers: authHeader(adminToken()),
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.divisions).toHaveLength(1)

    const div = body.divisions[0]
    expect(div.divisionId).toBe(division.id)
    expect(div.paidCount).toBe(3)
    expect(div.grossCollected).toBe(30) // 3 * $10 entry fee
    expect(div.houseTotal).toBe(3)      // 3 * $1 house cut
    // pool = 30 - 3 (house) - 6 (eoy base) = 21; no rounding remainder since 3 players → single 100% slot
    expect(div.pool).toBe(21)
    expect(div.eoyTotal).toBe(6)

    const payoutFor = (playerId: string) => div.payouts.find((p: any) => p.playerId === playerId)
    expect(payoutFor(p1.id)).toMatchObject({ place: 1, payout: 21, isTied: false })
    expect(payoutFor(p2.id)).toMatchObject({ payout: 0 })
    expect(payoutFor(p3.id)).toMatchObject({ payout: 0 })
  })

  it('404s for an unknown league night', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/league-nights/does-not-exist/payouts',
      headers: authHeader(adminToken()),
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('GET /league-nights/:id/payouts (public)', () => {
  it('requires no authentication and only lists players who are actually in the money', async () => {
    const { leagueNight, p1, p2, p3 } = await setupPayoutScenario()

    const res = await app.inject({ method: 'GET', url: `/league-nights/${leagueNight.id}/payouts` })
    expect(res.statusCode).toBe(200)

    const { payouts } = res.json()
    expect(payouts[p1.id]).toMatchObject({ payout: 21, place: 1 })
    // p2/p3 earned $0 and aren't tied/pending, so the public payout map omits them entirely
    expect(payouts[p2.id]).toBeUndefined()
    expect(payouts[p3.id]).toBeUndefined()
  })

  it('only pays out players who have actually paid their entry fee', async () => {
    const division = await createDivision({ code: 'FPO', entryFee: 10 })
    const season = await createSeason()
    const leagueNight = await createLeagueNight(season.id)
    const hole1 = await createHole(leagueNight.id, 1)
    const round1 = await createRound(leagueNight.id, 1)
    const { player: paid } = await createPlayer(division.id, { name: 'Paid' })
    const { player: unpaid } = await createPlayer(division.id, { name: 'Unpaid' })

    await createScore({ playerId: paid.id, holeId: hole1.id, roundId: round1.id, position: Position.SHORT, made: 3 })
    await createScore({ playerId: unpaid.id, holeId: hole1.id, roundId: round1.id, position: Position.SHORT, made: 1 })
    await createCheckIn({ leagueNightId: leagueNight.id, playerId: paid.id, divisionId: division.id, hasPaid: true })
    await createCheckIn({ leagueNightId: leagueNight.id, playerId: unpaid.id, divisionId: division.id, hasPaid: false })

    const res = await app.inject({ method: 'GET', url: `/league-nights/${leagueNight.id}/payouts` })
    const { payouts } = res.json()
    // Only 1 paid player in the division → pool = 10 - 1 - 2 = 7, winner takes all
    expect(payouts[paid.id]).toMatchObject({ payout: 7 })
    expect(payouts[unpaid.id]).toBeUndefined()
  })
})

describe('GET /admin/seasons/active/financials', () => {
  it('requires admin', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/seasons/active/financials' })
    expect(res.statusCode).toBe(401)
  })

  it('aggregates paid count, gross, house, and EOY totals for the active season', async () => {
    await setupPayoutScenario()

    const res = await app.inject({
      method: 'GET',
      url: '/admin/seasons/active/financials',
      headers: authHeader(adminToken()),
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.nights).toHaveLength(1)
    expect(body.totals).toMatchObject({
      paidCount: 3,
      grossCollected: 30,
      houseTotal: 3,
      eoyTotal: 6,
      payoutPool: 21,
      payoutRemainder: 0,
    })
  })

  it('returns an empty summary when there is no active season', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/seasons/active/financials',
      headers: authHeader(adminToken()),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().season).toBeNull()
  })
})
