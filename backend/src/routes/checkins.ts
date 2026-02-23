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
    return reply.send({ checkIns })
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

    const checkIn = await prisma.checkIn.upsert({
      where: { leagueNightId_playerId: { leagueNightId: id, playerId: player.id } },
      create: { leagueNightId: id, playerId: player.id, checkedInBy: req.user!.userId },
      update: {},
      include: { player: { include: { user: true, division: true } } },
    })
    return reply.status(201).send({ checkIn })
  })

  // DELETE /league-nights/:id/checkin/me – player checks themselves out
  app.delete('/league-nights/:id/checkin/me', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }

    const player = await prisma.player.findUnique({
      where: { userId: req.user!.userId },
    })
    if (!player) return reply.status(204).send()

    await prisma.checkIn.deleteMany({
      where: { leagueNightId: id, playerId: player.id },
    })
    return reply.status(204).send()
  })

  // POST check in any player – admin/scorekeeper only (for manual overrides)
  app.post('/league-nights/:id/checkins', { preHandler: requireScorekeeper }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { playerId } = checkInSchema.parse(req.body)

    const checkIn = await prisma.checkIn.upsert({
      where: { leagueNightId_playerId: { leagueNightId: id, playerId } },
      create: { leagueNightId: id, playerId, checkedInBy: req.user!.userId },
      update: { checkedInBy: req.user!.userId },
      include: { player: { include: { user: true, division: true } } },
    })
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
    await prisma.checkIn.delete({
      where: { leagueNightId_playerId: { leagueNightId: id, playerId } },
    })
    return reply.status(204).send()
  })
}
