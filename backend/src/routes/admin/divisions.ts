import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { requireAdmin } from '../../middleware/auth.js'

const divisionSchema = z.object({
  code: z.string().min(1).max(10).toUpperCase(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
})

export async function divisionRoutes(app: FastifyInstance) {
  // GET /admin/divisions
  app.get('/admin/divisions', { preHandler: requireAdmin }, async (_req, reply) => {
    const divisions = await prisma.division.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { players: true } } },
    })
    return reply.send({ divisions })
  })

  // POST /admin/divisions
  app.post('/admin/divisions', { preHandler: requireAdmin }, async (req, reply) => {
    const data = divisionSchema.parse(req.body)
    const division = await prisma.division.create({ data })
    return reply.status(201).send({ division })
  })

  // PATCH /admin/divisions/:id
  app.patch('/admin/divisions/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const data = divisionSchema.partial().parse(req.body)
    const division = await prisma.division.update({ where: { id }, data })
    return reply.send({ division })
  })

  // DELETE /admin/divisions/:id
  app.delete('/admin/divisions/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string }
    await prisma.division.delete({ where: { id } })
    return reply.status(204).send()
  })
}
