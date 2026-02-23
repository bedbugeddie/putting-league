import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { requireAdmin } from '../../middleware/auth.js'

const seasonSchema = z.object({
  name: z.string().min(1).max(100),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional(),
  isActive: z.boolean().default(true),
})

export async function seasonRoutes(app: FastifyInstance) {
  app.get('/admin/seasons', { preHandler: requireAdmin }, async (_req, reply) => {
    const seasons = await prisma.season.findMany({
      orderBy: { startDate: 'desc' },
      include: { _count: { select: { leagueNights: true } } },
    })
    return reply.send({ seasons })
  })

  app.get('/admin/seasons/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const season = await prisma.season.findUnique({
      where: { id },
      include: { leagueNights: { orderBy: { date: 'desc' } } },
    })
    if (!season) return reply.status(404).send({ error: 'Season not found' })
    return reply.send({ season })
  })

  app.post('/admin/seasons', { preHandler: requireAdmin }, async (req, reply) => {
    const data = seasonSchema.parse(req.body)
    const season = await prisma.season.create({
      data: { ...data, startDate: new Date(data.startDate), endDate: data.endDate ? new Date(data.endDate) : undefined },
    })
    return reply.status(201).send({ season })
  })

  app.patch('/admin/seasons/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const patchSchema = z.object({
      name: z.string().min(1).max(100).optional(),
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().nullable().optional(),
      isActive: z.boolean().optional(),
    })
    const body = patchSchema.parse(req.body)
    const data: any = { ...body }
    if (body.startDate) data.startDate = new Date(body.startDate)
    if (body.endDate !== undefined) data.endDate = body.endDate ? new Date(body.endDate) : null
    const season = await prisma.season.update({ where: { id }, data })
    return reply.send({ season })
  })

  app.delete('/admin/seasons/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string }

    const nights = await prisma.leagueNight.findMany({
      where: { seasonId: id },
      select: { id: true },
    })
    const nightIds = nights.map(n => n.id)

    if (nightIds.length > 0) {
      // Scores reference Hole and Round with no cascade, so delete them first
      await prisma.score.deleteMany({ where: { hole: { leagueNightId: { in: nightIds } } } })
      // PuttOff has no cascade from LeagueNight; participants cascade from PuttOff
      await prisma.puttOff.deleteMany({ where: { leagueNightId: { in: nightIds } } })
      // LeagueNight cascade covers: Hole, Round, CheckIn, Card, CardPlayer, ScorekeeperAssignment
      await prisma.leagueNight.deleteMany({ where: { seasonId: id } })
    }

    await prisma.season.delete({ where: { id } })
    return reply.status(204).send()
  })
}
