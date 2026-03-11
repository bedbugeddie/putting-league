import type { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma.js'

export async function motwRoutes(app: FastifyInstance) {
  // GET /motw/active — public; returns the currently-active MOTW or null
  app.get('/motw/active', async (_req, _reply) => {
    const now = new Date()
    const motw = await prisma.motw.findFirst({
      where: {
        startDate: { lte: now },
        endDate:   { gte: now },
      },
      orderBy: { startDate: 'desc' },
    })
    return motw ?? null
  })
}
