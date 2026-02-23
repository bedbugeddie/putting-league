import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { Position } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { requireScorekeeper, requireAuth } from '../middleware/auth.js'
import { upsertScore, calcLeagueNightTotals, detectTies } from '../services/scoring.js'
import { broadcastToRoom } from '../plugins/websocket.js'
import { createPuttOff, recordPuttOffRound } from '../services/tiebreaker.js'

const scoreSchema = z.object({
  playerId: z.string().cuid(),
  holeId: z.string().cuid(),
  roundId: z.string().cuid(),
  position: z.nativeEnum(Position),
  made: z.number().int().min(0).max(3),
})

const bulkScoreSchema = z.object({
  scores: z.array(scoreSchema),
})

const puttOffRoundSchema = z.object({
  scores: z.array(z.object({
    playerId: z.string().cuid(),
    made: z.number().int().min(0).max(3),
  })),
})

export async function scoringRoutes(app: FastifyInstance) {
  // GET /scoring/my-active-night – returns the in-progress night the user is currently scoring
  app.get('/scoring/my-active-night', { preHandler: requireAuth }, async (req, reply) => {
    const player = await prisma.player.findUnique({ where: { userId: req.user!.userId } })
    if (!player) return reply.send({ nightId: null })

    const card = await prisma.card.findFirst({
      where: {
        scorekeeperId: player.id,
        leagueNight: { status: 'IN_PROGRESS' },
      },
      select: { leagueNightId: true },
    })

    return reply.send({ nightId: card?.leagueNightId ?? null })
  })

  // GET highlights for a league night (most bonuses, longest streak, most improved, perfect rounders)
  app.get('/league-nights/:id/highlights', async (req, reply) => {
    const { id } = req.params as { id: string }

    const night = await prisma.leagueNight.findUnique({
      where: { id },
      include: {
        rounds: { orderBy: { number: 'asc' } },
        holes: { orderBy: { number: 'asc' } },
      },
    })
    if (!night) return reply.status(404).send({ error: 'Night not found' })

    const scores = await prisma.score.findMany({
      where: { hole: { leagueNightId: id } },
      include: { player: { include: { user: true, division: true } } },
    })

    // Build per-player lookup
    type HoleScores = { SHORT?: number; LONG?: number }
    const playerMap = new Map<
      string,
      { name: string; divisionCode: string; roundHoleScores: Map<string, Map<string, HoleScores>> }
    >()
    for (const score of scores) {
      const pid = score.playerId
      if (!playerMap.has(pid)) {
        playerMap.set(pid, {
          name: score.player.user.name,
          divisionCode: score.player.division.code,
          roundHoleScores: new Map(),
        })
      }
      const pm = playerMap.get(pid)!
      if (!pm.roundHoleScores.has(score.roundId)) pm.roundHoleScores.set(score.roundId, new Map())
      const roundMap = pm.roundHoleScores.get(score.roundId)!
      if (!roundMap.has(score.holeId)) roundMap.set(score.holeId, {})
      roundMap.get(score.holeId)![score.position as 'SHORT' | 'LONG'] = score.made
    }

    // 1. Most bonuses (individual perfect shots where made === 3)
    let mostBonuses: { playerName: string; divisionCode: string; count: number } | null = null
    const bonusCounts = new Map<string, number>()
    for (const score of scores) {
      if (score.bonus) bonusCounts.set(score.playerId, (bonusCounts.get(score.playerId) ?? 0) + 1)
    }
    for (const [pid, count] of bonusCounts) {
      if (!mostBonuses || count > mostBonuses.count) {
        const pm = playerMap.get(pid)!
        mostBonuses = { playerName: pm.name, divisionCode: pm.divisionCode, count }
      }
    }

    // 2. Longest streak (consecutive holes where both SHORT and LONG === 3)
    let longestStreak: { playerName: string; divisionCode: string; streak: number } | null = null
    for (const [, pm] of playerMap) {
      let streak = 0
      let maxStreak = 0
      for (const round of night.rounds) {
        for (const hole of night.holes) {
          const hs = pm.roundHoleScores.get(round.id)?.get(hole.id)
          if (hs?.SHORT === 3 && hs?.LONG === 3) {
            streak++
            if (streak > maxStreak) maxStreak = streak
          } else {
            streak = 0
          }
        }
      }
      if (maxStreak >= 2 && (!longestStreak || maxStreak > longestStreak.streak)) {
        longestStreak = { playerName: pm.name, divisionCode: pm.divisionCode, streak: maxStreak }
      }
    }

    // 3. Most improved vs most recent previous night
    const playerIds = Array.from(playerMap.keys())
    const tonightMade = new Map<string, number>()
    for (const score of scores) {
      tonightMade.set(score.playerId, (tonightMade.get(score.playerId) ?? 0) + score.made)
    }

    let mostImproved: {
      playerName: string; divisionCode: string; delta: number; previous: number; current: number
    } | null = null

    if (playerIds.length > 0) {
      const prevScoreRows = await prisma.score.findMany({
        where: {
          playerId: { in: playerIds },
          hole: { leagueNight: { id: { not: id }, status: 'COMPLETED' } },
        },
        select: {
          playerId: true,
          made: true,
          hole: { select: { leagueNightId: true, leagueNight: { select: { date: true } } } },
        },
      })

      // Group: playerId -> nightId -> { date, totalMade }
      const prevNights = new Map<string, Map<string, { date: Date; totalMade: number }>>()
      for (const row of prevScoreRows) {
        const pid = row.playerId
        const prevNightId = row.hole.leagueNightId
        const date = row.hole.leagueNight.date
        if (!prevNights.has(pid)) prevNights.set(pid, new Map())
        const byNight = prevNights.get(pid)!
        if (!byNight.has(prevNightId)) byNight.set(prevNightId, { date, totalMade: 0 })
        byNight.get(prevNightId)!.totalMade += row.made
      }

      for (const [pid, byNight] of prevNights) {
        let mostRecent: { date: Date; totalMade: number } | null = null
        for (const n of byNight.values()) {
          if (!mostRecent || n.date > mostRecent.date) mostRecent = n
        }
        if (!mostRecent) continue
        const current = tonightMade.get(pid) ?? 0
        const delta = current - mostRecent.totalMade
        if (delta > 0 && (!mostImproved || delta > mostImproved.delta)) {
          const pm = playerMap.get(pid)!
          mostImproved = {
            playerName: pm.name, divisionCode: pm.divisionCode,
            delta, previous: mostRecent.totalMade, current,
          }
        }
      }
    }

    // 4. Perfect rounders (both SHORT and LONG === 3 on every hole in a round)
    const perfectRounders: { playerName: string; divisionCode: string; roundNumber: number }[] = []
    for (const [, pm] of playerMap) {
      for (const round of night.rounds) {
        if (night.holes.length === 0) continue
        const roundMap = pm.roundHoleScores.get(round.id)
        if (!roundMap) continue
        const isPerfect = night.holes.every(hole => {
          const hs = roundMap.get(hole.id)
          return hs?.SHORT === 3 && hs?.LONG === 3
        })
        if (isPerfect) {
          perfectRounders.push({ playerName: pm.name, divisionCode: pm.divisionCode, roundNumber: round.number })
        }
      }
    }

    return reply.send({ mostBonuses, longestStreak, mostImproved, perfectRounders })
  })

  // GET scores for a league night
  app.get('/league-nights/:id/scores', async (req, reply) => {
    const { id } = req.params as { id: string }

    const scores = await prisma.score.findMany({
      where: { hole: { leagueNightId: id } },
      include: {
        player: { include: { user: true, division: true } },
        hole: true,
        round: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    return reply.send({ scores })
  })

  // GET scores for a specific player in a league night
  app.get('/league-nights/:id/scores/player/:playerId', async (req, reply) => {
    const { id, playerId } = req.params as { id: string; playerId: string }

    const scores = await prisma.score.findMany({
      where: { hole: { leagueNightId: id }, playerId },
      include: { hole: true, round: true },
      orderBy: [{ round: { number: 'asc' } }, { hole: { number: 'asc' } }],
    })

    return reply.send({ scores })
  })

  // POST – enter a single score (any authenticated user)
  app.post('/scoring/score', { preHandler: requireAuth }, async (req, reply) => {
    const body = scoreSchema.parse(req.body)
    const enteredBy = req.user!.userId

    const score = await upsertScore({ ...body, enteredBy })

    // Get the league night id from the hole
    const hole = await prisma.hole.findUnique({ where: { id: body.holeId } })
    if (hole) {
      const totals = await calcLeagueNightTotals(hole.leagueNightId)
      broadcastToRoom(hole.leagueNightId, {
        type: 'SCORE_UPDATED',
        leagueNightId: hole.leagueNightId,
        payload: { score, leaderboard: totals },
      })
    }

    return reply.status(201).send({ score })
  })

  // POST – bulk score entry for a hole (any authenticated user)
  app.post('/scoring/bulk', { preHandler: requireAuth }, async (req, reply) => {
    const body = bulkScoreSchema.parse(req.body)
    const enteredBy = req.user!.userId

    const results = await Promise.all(
      body.scores.map(s => upsertScore({ ...s, enteredBy }))
    )

    // Broadcast updates
    if (results.length > 0) {
      const hole = await prisma.hole.findUnique({ where: { id: body.scores[0].holeId } })
      if (hole) {
        const totals = await calcLeagueNightTotals(hole.leagueNightId)
        broadcastToRoom(hole.leagueNightId, {
          type: 'LEADERBOARD_UPDATED',
          leagueNightId: hole.leagueNightId,
          payload: { leaderboard: totals },
        })
      }
    }

    return reply.send({ scores: results })
  })

  // POST – mark a round as complete (any authenticated user)
  app.post('/scoring/rounds/:id/complete', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const round = await prisma.round.update({
      where: { id },
      data: { isComplete: true },
      include: { leagueNight: true },
    })

    broadcastToRoom(round.leagueNightId, {
      type: 'ROUND_COMPLETED',
      leagueNightId: round.leagueNightId,
      payload: { roundId: id, roundNumber: round.number },
    })

    return reply.send({ round })
  })

  // POST – start putt-off for a league night (any authenticated user)
  app.post('/scoring/league-nights/:id/putt-off', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { divisionId, playerIds } = req.body as { divisionId: string; playerIds: string[] }

    const puttOff = await createPuttOff(id, divisionId, playerIds)

    broadcastToRoom(id, {
      type: 'PUTT_OFF_UPDATED',
      leagueNightId: id,
      payload: { puttOff },
    })

    return reply.status(201).send({ puttOff })
  })

  // POST – record putt-off round scores (any authenticated user)
  app.post('/scoring/putt-offs/:id/round', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = puttOffRoundSchema.parse(req.body)

    const result = await recordPuttOffRound(id, body.scores)

    const puttOff = await prisma.puttOff.findUnique({
      where: { id },
      include: { participants: true },
    })

    if (puttOff) {
      broadcastToRoom(puttOff.leagueNightId, {
        type: 'PUTT_OFF_UPDATED',
        leagueNightId: puttOff.leagueNightId,
        payload: { puttOff, result },
      })
    }

    return reply.send({ result })
  })

  // GET putt-offs for a league night
  app.get('/league-nights/:id/putt-offs', async (req, reply) => {
    const { id } = req.params as { id: string }
    const puttOffs = await prisma.puttOff.findMany({
      where: { leagueNightId: id },
      include: {
        participants: {
          include: { player: { include: { user: true } } },
          orderBy: { round: 'asc' },
        },
      },
    })
    return reply.send({ puttOffs })
  })
}
