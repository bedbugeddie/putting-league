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
  // GET /settings/league-info – public, returns the editable league info markdown
  app.get('/settings/league-info', async (_req, reply) => {
    const settings = await getSettings()
    return reply.send({ leagueInfoMd: settings.leagueInfoMd ?? null })
  })

  // GET /admin/settings – return current fee-split configuration
  app.get('/admin/settings', { preHandler: requireAdmin }, async (_req, reply) => {
    const settings = await getSettings()
    return reply.send({ settings })
  })

  // PATCH /admin/settings – update house, EOY per-entry amounts, and/or league info markdown
  app.patch('/admin/settings', { preHandler: requireAdmin }, async (req, reply) => {
    const body = z.object({
      housePerEntry: z.coerce.number().min(0).optional(),
      eoyPerEntry:   z.coerce.number().min(0).optional(),
      leagueInfoMd:  z.string().optional(),
    }).parse(req.body)

    const settings = await prisma.settings.upsert({
      where: { id: 1 },
      update: {
        ...(body.housePerEntry !== undefined ? { housePerEntry: body.housePerEntry } : {}),
        ...(body.eoyPerEntry   !== undefined ? { eoyPerEntry:   body.eoyPerEntry   } : {}),
        ...(body.leagueInfoMd  !== undefined ? { leagueInfoMd:  body.leagueInfoMd  } : {}),
      },
      create: {
        id: 1,
        housePerEntry: body.housePerEntry ?? 1,
        eoyPerEntry:   body.eoyPerEntry   ?? 2,
        leagueInfoMd:  body.leagueInfoMd  ?? null,
      },
    })

    return reply.send({ settings })
  })
}
