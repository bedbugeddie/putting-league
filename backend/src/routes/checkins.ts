import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth, requireScorekeeper } from '../middleware/auth.js'

const checkInSchema = z.object({
  playerId: z.string().cuid(),
})

const bulkCheckInSchema = z.object({
  playerIds: z.array(z.string().cuid()),
})

const paymentSchema = z.object({
  hasPaid: z.boolean(),
})

export async function checkInRoutes(app: FastifyInstance) {
  // GET all check-ins for a league night (public)
  app.get('/league-nights/:id/checkins', async (req, reply) => {
    const { id } = req.params as { id: string }
    const checkIns = await prisma.checkIn.findMany({
      where: { leagueNightId: id },
      include: {
        player: { include: { user: true, division: true } },
      },
      orderBy: { player: { user: { name: 'asc' } } },
    })

    if (!checkIns.length) return reply.send({ checkIns })

    const playerIds = checkIns.map(c => c.playerId)

    // Total check-in count per player (all-time)
    const checkInCounts = await prisma.checkIn.groupBy({
      by: ['playerId'],
      where: { playerId: { in: playerIds } },
      _count: { id: true },
    })
    const checkInCountMap = new Map(checkInCounts.map(r => [r.playerId, r._count.id]))

    // Scores across all completed nights excluding the current one
    const scores = await prisma.score.findMany({
      where: {
        playerId: { in: playerIds },
        hole: { leagueNight: { status: 'COMPLETED', id: { not: id } } },
      },
      select: {
        playerId: true,
        made: true,
        bonus: true,
        hole: {
          select: {
            leagueNightId: true,
            leagueNight: { select: { date: true } },
          },
        },
      },
    })

    // Group scores by player → night
    const playerNights = new Map<string, Map<string, { date: Date; score: number }>>()
    for (const s of scores) {
      const nid = s.hole.leagueNightId
      if (!playerNights.has(s.playerId)) playerNights.set(s.playerId, new Map())
      const nights = playerNights.get(s.playerId)!
      if (!nights.has(nid)) nights.set(nid, { date: s.hole.leagueNight.date, score: 0 })
      nights.get(nid)!.score += s.made + (s.bonus ? 1 : 0)
    }

    // Compute per-player stats
    const statsMap = new Map<string, { avgNightScore: number | null; prevNightScore: number | null; totalCheckIns: number }>()
    for (const playerId of playerIds) {
      const nights = [...(playerNights.get(playerId)?.values() ?? [])]
        .sort((a, b) => b.date.getTime() - a.date.getTime())
      const avg = nights.length
        ? Math.round(nights.reduce((s, n) => s + n.score, 0) / nights.length * 10) / 10
        : null
      statsMap.set(playerId, {
        avgNightScore: avg,
        prevNightScore: nights[0]?.score ?? null,
        totalCheckIns: checkInCountMap.get(playerId) ?? 0,
      })
    }

    const enriched = checkIns.map(c => ({
      ...c,
      stats: statsMap.get(c.playerId) ?? { avgNightScore: null, prevNightScore: null, totalCheckIns: 0 },
    }))

    return reply.send({ checkIns: enriched })
  })

  // POST /league-nights/:id/checkin/me – player checks themselves in
  app.post('/league-nights/:id/checkin/me', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }

    const player = await prisma.player.findUnique({
      where: { userId: req.user!.userId },
    })
    if (!player) {
      return reply.status(400).send({ error: 'No player profile found. Ask an admin to add you.' })
    }

    const [checkIn] = await prisma.$transaction([
      prisma.checkIn.upsert({
        where: { leagueNightId_playerId: { leagueNightId: id, playerId: player.id } },
        create: { leagueNightId: id, playerId: player.id, checkedInBy: req.user!.userId },
        update: {},
        include: { player: { include: { user: true, division: true } } },
      }),
      // If they were previously marked as left on a card, restore them
      prisma.cardPlayer.updateMany({
        where: { playerId: player.id, card: { leagueNightId: id }, hasLeft: true },
        data: { hasLeft: false },
      }),
    ])
    return reply.status(201).send({ checkIn })
  })

  // DELETE /league-nights/:id/checkin/me – player checks themselves out
  app.delete('/league-nights/:id/checkin/me', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }

    const player = await prisma.player.findUnique({
      where: { userId: req.user!.userId },
    })
    if (!player) return reply.status(204).send()

    await prisma.$transaction([
      // Delete the check-in record
      prisma.checkIn.deleteMany({ where: { leagueNightId: id, playerId: player.id } }),
      // Mark them as having left on any card they're on — do NOT remove them from the card
      prisma.cardPlayer.updateMany({ where: { playerId: player.id, card: { leagueNightId: id } }, data: { hasLeft: true } }),
    ])
    return reply.status(204).send()
  })

  // POST check in any player – admin/scorekeeper only (for manual overrides)
  app.post('/league-nights/:id/checkins', { preHandler: requireScorekeeper }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { playerId } = checkInSchema.parse(req.body)

    const [checkIn] = await prisma.$transaction([
      prisma.checkIn.upsert({
        where: { leagueNightId_playerId: { leagueNightId: id, playerId } },
        create: { leagueNightId: id, playerId, checkedInBy: req.user!.userId },
        update: { checkedInBy: req.user!.userId },
        include: { player: { include: { user: true, division: true } } },
      }),
      // If they were previously marked as left on a card, restore them
      prisma.cardPlayer.updateMany({
        where: { playerId, card: { leagueNightId: id }, hasLeft: true },
        data: { hasLeft: false },
      }),
    ])
    return reply.status(201).send({ checkIn })
  })

  // POST bulk check-in – admin/scorekeeper override
  app.post('/league-nights/:id/checkins/bulk', { preHandler: requireScorekeeper }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { playerIds } = bulkCheckInSchema.parse(req.body)

    await prisma.checkIn.createMany({
      data: playerIds.map(playerId => ({
        leagueNightId: id,
        playerId,
        checkedInBy: req.user!.userId,
      })),
      skipDuplicates: true,
    })

    const checkIns = await prisma.checkIn.findMany({
      where: { leagueNightId: id },
      include: { player: { include: { user: true, division: true } } },
      orderBy: { player: { user: { name: 'asc' } } },
    })
    return reply.send({ checkIns })
  })

  // DELETE check out any player – admin/scorekeeper override
  app.delete('/league-nights/:id/checkins/:playerId', { preHandler: requireScorekeeper }, async (req, reply) => {
    const { id, playerId } = req.params as { id: string; playerId: string }
    await prisma.$transaction([
      prisma.checkIn.delete({ where: { leagueNightId_playerId: { leagueNightId: id, playerId } } }),
      prisma.card.updateMany({ where: { leagueNightId: id, scorekeeperId: playerId }, data: { scorekeeperId: null } }),
      prisma.cardPlayer.deleteMany({ where: { playerId, card: { leagueNightId: id } } }),
    ])
    return reply.status(204).send()
  })

  // PATCH mark player as paid/unpaid – admin/scorekeeper only
  app.patch('/league-nights/:id/checkins/:playerId', { preHandler: requireScorekeeper }, async (req, reply) => {
    const { id, playerId } = req.params as { id: string; playerId: string }
    const { hasPaid } = paymentSchema.parse(req.body)

    const checkIn = await prisma.checkIn.update({
      where: { leagueNightId_playerId: { leagueNightId: id, playerId } },
      data: { hasPaid },
      include: { player: { include: { user: true, division: true } } },
    })
    return reply.send({ checkIn })
  })
}
