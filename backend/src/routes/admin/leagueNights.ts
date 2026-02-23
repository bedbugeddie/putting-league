import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { requireAdmin, requireScorekeeper } from '../../middleware/auth.js'
import { LeagueStatus, TieBreakerMode } from '@prisma/client'

const createNightSchema = z.object({
  seasonId: z.string().min(1),
  // Accept any date string — datetime-local inputs omit timezone
  date: z.string().min(1),
  tieBreakerMode: z.nativeEnum(TieBreakerMode).default('SPLIT'),
  notes: z.string().max(1000).optional(),
  holeCount: z.number().int().min(1).max(36).default(6),
  roundCount: z.number().int().min(1).max(20).default(3),
})

const updateNightSchema = z.object({
  date: z.string().min(1).optional(),
  status: z.nativeEnum(LeagueStatus).optional(),
  tieBreakerMode: z.nativeEnum(TieBreakerMode).optional(),
  notes: z.string().max(1000).optional(),
})

const assignScorekeeperSchema = z.object({
  userId: z.string().cuid(),
  holeNumbers: z.array(z.number().int().positive()).default([]),
})

export async function leagueNightRoutes(app: FastifyInstance) {
  // List all league nights (public-ish – spectators can see)
  app.get('/league-nights', async (_req, reply) => {
    const nights = await prisma.leagueNight.findMany({
      orderBy: { date: 'desc' },
      include: {
        season: true,
        _count: { select: { rounds: true, holes: true } },
      },
    })
    return reply.send({ leagueNights: nights })
  })

  // Get single league night with full details
  app.get('/league-nights/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const night = await prisma.leagueNight.findUnique({
      where: { id },
      include: {
        season: true,
        holes: { orderBy: { number: 'asc' } },
        rounds: { orderBy: { number: 'asc' } },
        scorekeeperAssignments: { include: { user: true } },
      },
    })
    if (!night) return reply.status(404).send({ error: 'League night not found' })
    return reply.send({ leagueNight: night })
  })

  // Create league night with holes and rounds auto-generated
  app.post('/admin/league-nights', { preHandler: requireAdmin }, async (req, reply) => {
    const body = createNightSchema.parse(req.body)

    const night = await prisma.leagueNight.create({
      data: {
        seasonId: body.seasonId,
        date: new Date(body.date),
        tieBreakerMode: body.tieBreakerMode,
        notes: body.notes,
        holes: {
          create: Array.from({ length: body.holeCount }, (_, i) => ({
            number: i + 1,
          })),
        },
        rounds: {
          create: Array.from({ length: body.roundCount }, (_, i) => ({
            number: i + 1,
          })),
        },
      },
      include: {
        holes: { orderBy: { number: 'asc' } },
        rounds: { orderBy: { number: 'asc' } },
      },
    })

    return reply.status(201).send({ leagueNight: night })
  })

  // Update league night
  app.patch('/admin/league-nights/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = updateNightSchema.parse(req.body)
    const data: any = { ...body }
    if (body.date) data.date = new Date(body.date)
    const night = await prisma.leagueNight.update({ where: { id }, data })
    return reply.send({ leagueNight: night })
  })

  // Delete league night
  app.delete('/admin/league-nights/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string }
    // Scores reference Hole/Round with no cascade, so delete them first
    await prisma.score.deleteMany({ where: { hole: { leagueNightId: id } } })
    // PuttOff has no cascade from LeagueNight; participants cascade from PuttOff
    await prisma.puttOff.deleteMany({ where: { leagueNightId: id } })
    // LeagueNight cascade covers: Hole, Round, CheckIn, Card, CardPlayer, ScorekeeperAssignment
    await prisma.leagueNight.delete({ where: { id } })
    return reply.status(204).send()
  })

  // Assign scorekeeper
  app.post('/admin/league-nights/:id/scorekeepers', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = assignScorekeeperSchema.parse(req.body)
    const assignment = await prisma.scorekeeperAssignment.upsert({
      where: { leagueNightId_userId: { leagueNightId: id, userId: body.userId } },
      create: { leagueNightId: id, userId: body.userId, holeNumbers: body.holeNumbers },
      update: { holeNumbers: body.holeNumbers },
      include: { user: true },
    })
    return reply.send({ assignment })
  })

  // Remove scorekeeper
  app.delete('/admin/league-nights/:id/scorekeepers/:userId', { preHandler: requireAdmin }, async (req, reply) => {
    const { id, userId } = req.params as { id: string; userId: string }
    await prisma.scorekeeperAssignment.delete({
      where: { leagueNightId_userId: { leagueNightId: id, userId } },
    })
    return reply.status(204).send()
  })

  // Get active league night
  app.get('/league-nights/active', async (_req, reply) => {
    const night = await prisma.leagueNight.findFirst({
      where: { status: 'IN_PROGRESS' },
      orderBy: { date: 'desc' },
      include: {
        season: true,
        holes: { orderBy: { number: 'asc' } },
        rounds: { orderBy: { number: 'asc' } },
      },
    })
    return reply.send({ leagueNight: night ?? null })
  })
}
