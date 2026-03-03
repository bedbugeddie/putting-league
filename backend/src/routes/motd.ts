import type { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma.js'

export async function motdRoutes(app: FastifyInstance) {
  // GET /motd/active — public; returns the currently-active MOTD or null
  app.get('/motd/active', async (_req, _reply) => {
    const now = new Date()
    const motd = await prisma.motd.findFirst({
      where: {
        startDate: { lte: now },
        endDate:   { gte: now },
      },
      orderBy: { startDate: 'desc' },
    })
    return motd ?? null
  })
}
