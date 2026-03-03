import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma.js'
import { requireAdmin } from '../../middleware/auth.js'

export async function adminMotdRoutes(app: FastifyInstance) {
  // GET /admin/motd — list all MOTDs newest first
  app.get('/admin/motd', { preHandler: requireAdmin }, async () => {
    return prisma.motd.findMany({ orderBy: { startDate: 'desc' } })
  })

  // POST /admin/motd — create a new MOTD
  app.post<{
    Body: { title?: string; body: string; startDate: string; endDate: string }
  }>('/admin/motd', { preHandler: requireAdmin }, async (req, reply) => {
    const { title, body, startDate, endDate } = req.body
    const motd = await prisma.motd.create({
      data: {
        title: title?.trim() || null,
        body,
        startDate: new Date(startDate),
        endDate:   new Date(endDate),
      },
    })
    return reply.code(201).send(motd)
  })

  // PATCH /admin/motd/:id — update an existing MOTD
  app.patch<{
    Params: { id: string }
    Body: { title?: string | null; body?: string; startDate?: string; endDate?: string }
  }>('/admin/motd/:id', { preHandler: requireAdmin }, async (req) => {
    const { title, body, startDate, endDate } = req.body
    return prisma.motd.update({
      where: { id: req.params.id },
      data: {
        ...(title !== undefined ? { title: title?.trim() || null } : {}),
        ...(body      !== undefined ? { body }                          : {}),
        ...(startDate !== undefined ? { startDate: new Date(startDate) } : {}),
        ...(endDate   !== undefined ? { endDate:   new Date(endDate)   } : {}),
      },
    })
  })

  // DELETE /admin/motd/:id
  app.delete<{ Params: { id: string } }>(
    '/admin/motd/:id',
    { preHandler: requireAdmin },
    async (req, reply) => {
      await prisma.motd.delete({ where: { id: req.params.id } })
      return reply.code(204).send()
    },
  )
}
