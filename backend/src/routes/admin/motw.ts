import type { FastifyInstance } from 'fastify'
import { prisma } from '../../lib/prisma.js'
import { requireAdmin } from '../../middleware/auth.js'

export async function adminMotwRoutes(app: FastifyInstance) {
  // GET /admin/motw — list all MOTWs newest first
  app.get('/admin/motw', { preHandler: requireAdmin }, async () => {
    return prisma.motw.findMany({ orderBy: { startDate: 'desc' } })
  })

  // POST /admin/motw — create a new MOTW
  app.post<{
    Body: { title?: string; body: string; startDate: string; endDate: string }
  }>('/admin/motw', { preHandler: requireAdmin }, async (req, reply) => {
    const { title, body, startDate, endDate } = req.body
    const motw = await prisma.motw.create({
      data: {
        title: title?.trim() || null,
        body,
        startDate: new Date(startDate),
        endDate:   new Date(endDate),
      },
    })
    return reply.code(201).send(motw)
  })

  // PATCH /admin/motw/:id — update an existing MOTW
  app.patch<{
    Params: { id: string }
    Body: { title?: string | null; body?: string; startDate?: string; endDate?: string }
  }>('/admin/motw/:id', { preHandler: requireAdmin }, async (req) => {
    const { title, body, startDate, endDate } = req.body
    return prisma.motw.update({
      where: { id: req.params.id },
      data: {
        ...(title !== undefined ? { title: title?.trim() || null } : {}),
        ...(body      !== undefined ? { body }                          : {}),
        ...(startDate !== undefined ? { startDate: new Date(startDate) } : {}),
        ...(endDate   !== undefined ? { endDate:   new Date(endDate)   } : {}),
      },
    })
  })

  // DELETE /admin/motw/:id
  app.delete<{ Params: { id: string } }>(
    '/admin/motw/:id',
    { preHandler: requireAdmin },
    async (req, reply) => {
      await prisma.motw.delete({ where: { id: req.params.id } })
      return reply.code(204).send()
    },
  )
}
