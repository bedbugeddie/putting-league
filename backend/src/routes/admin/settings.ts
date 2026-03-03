import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { requireAdmin } from '../../middleware/auth.js'

/** Always returns the singleton settings row, creating it with defaults if missing. */
export async function getSettings() {
  return prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, housePerEntry: 1, eoyPerEntry: 2 },
  })
}

export async function settingsRoutes(app: FastifyInstance) {
  // GET /admin/settings – return current fee-split configuration
  app.get('/admin/settings', { preHandler: requireAdmin }, async (_req, reply) => {
    const settings = await getSettings()
    return reply.send({ settings })
  })

  // PATCH /admin/settings – update house and/or EOY per-entry amounts
  app.patch('/admin/settings', { preHandler: requireAdmin }, async (req, reply) => {
    const body = z.object({
      housePerEntry: z.coerce.number().min(0).optional(),
      eoyPerEntry:   z.coerce.number().min(0).optional(),
    }).parse(req.body)

    const settings = await prisma.settings.upsert({
      where: { id: 1 },
      update: {
        ...(body.housePerEntry !== undefined ? { housePerEntry: body.housePerEntry } : {}),
        ...(body.eoyPerEntry   !== undefined ? { eoyPerEntry:   body.eoyPerEntry   } : {}),
      },
      create: {
        id: 1,
        housePerEntry: body.housePerEntry ?? 1,
        eoyPerEntry:   body.eoyPerEntry   ?? 2,
      },
    })

    return reply.send({ settings })
  })
}
