import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma.js'
import { requireAdmin } from '../../middleware/auth.js'

const updatePlayerSchema = z.object({
  divisionId: z.string().cuid().nullable().optional(),
  isActive: z.boolean().optional(),
  isAdmin: z.boolean().optional(),
  name: z.string().min(1).max(100).optional(),
})

const createPlayerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  divisionId: z.string().cuid().optional(),
  isAdmin: z.boolean().default(false),
})

export async function playerRoutes(app: FastifyInstance) {
  // List all players
  app.get('/admin/players', { preHandler: requireAdmin }, async (req, reply) => {
    const { divisionId, search, active } = req.query as {
      divisionId?: string
      search?: string
      active?: string
    }

    const players = await prisma.player.findMany({
      where: {
        ...(divisionId ? { divisionId } : {}),
        ...(active !== undefined ? { isActive: active === 'true' } : {}),
        ...(search ? { user: { name: { contains: search, mode: 'insensitive' } } } : {}),
      },
      include: {
        user: true,
        division: true,
        _count: { select: { scores: true } },
      },
      orderBy: { user: { name: 'asc' } },
    })

    return reply.send({ players })
  })

  // Get single player with stats
  app.get('/admin/players/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const player = await prisma.player.findUnique({
      where: { id },
      include: {
        user: true,
        division: true,
        scores: {
          include: { hole: { include: { leagueNight: true } }, round: true },
          orderBy: { createdAt: 'desc' },
          take: 100,
        },
      },
    })
    if (!player) return reply.status(404).send({ error: 'Player not found' })
    return reply.send({ player })
  })

  // Create player (also creates user if needed)
  app.post('/admin/players', { preHandler: requireAdmin }, async (req, reply) => {
    const body = createPlayerSchema.parse(req.body)

    const user = await prisma.user.upsert({
      where: { email: body.email },
      update: { name: body.name }, // never change isAdmin for existing users here
      create: { email: body.email, name: body.name, isAdmin: body.isAdmin },
    })

    // Check if player profile already exists
    const existing = await prisma.player.findUnique({ where: { userId: user.id } })
    if (existing) {
      // Update division if provided
      const updated = await prisma.player.update({
        where: { id: existing.id },
        data: { ...(body.divisionId !== undefined ? { divisionId: body.divisionId } : {}) },
        include: { user: true, division: true },
      })
      return reply.send({ player: updated })
    }

    const player = await prisma.player.create({
      data: { userId: user.id, divisionId: body.divisionId ?? null },
      include: { user: true, division: true },
    })

    return reply.status(201).send({ player })
  })

  // Update player
  app.patch('/admin/players/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = updatePlayerSchema.parse(req.body)

    const player = await prisma.player.findUnique({ where: { id }, include: { user: true } })
    if (!player) return reply.status(404).send({ error: 'Player not found' })

    // Update user fields if provided
    if (body.name !== undefined || body.isAdmin !== undefined) {
      await prisma.user.update({
        where: { id: player.userId },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.isAdmin !== undefined ? { isAdmin: body.isAdmin } : {}),
        },
      })
    }

    const updated = await prisma.player.update({
      where: { id },
      data: {
        ...(body.divisionId !== undefined ? { divisionId: body.divisionId } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
      include: { user: true, division: true },
    })

    return reply.send({ player: updated })
  })

  // Bulk import players
  app.post('/admin/players/import', { preHandler: requireAdmin }, async (req, reply) => {
    const bodySchema = z.object({
      players: z.array(z.object({
        name: z.string(),
        email: z.string(),
        divisionCode: z.string(),
        isActive: z.boolean().default(true),
      })),
    })
    const rowSchema = z.object({
      name: z.string().min(1),
      email: z.string().email(),
      divisionCode: z.string().min(1),
      isActive: z.boolean().default(true),
    })

    const { players } = bodySchema.parse(req.body)

    const divisions = await prisma.division.findMany()
    const divMap = new Map(divisions.map(d => [d.code.toLowerCase(), d]))

    let created = 0, updated = 0
    const errors: string[] = []

    for (let i = 0; i < players.length; i++) {
      const raw = players[i]

      const parsed = rowSchema.safeParse(raw)
      if (!parsed.success) {
        const msg = parsed.error.issues.map(e => e.message).join(', ')
        errors.push(`Row ${i + 1} (${raw.email || 'no email'}): ${msg}`)
        continue
      }
      const row = parsed.data

      const division = divMap.get(row.divisionCode.toLowerCase())
      if (!division) {
        errors.push(`Row ${i + 1} (${row.email}): unknown division "${row.divisionCode}"`)
        continue
      }
      try {
        const user = await prisma.user.upsert({
          where: { email: row.email },
          update: { name: row.name },
          create: { email: row.email, name: row.name },
        })
        const existing = await prisma.player.findUnique({ where: { userId: user.id } })
        if (existing) {
          await prisma.player.update({
            where: { id: existing.id },
            data: { divisionId: division.id, isActive: row.isActive },
          })
          updated++
        } else {
          await prisma.player.create({
            data: { userId: user.id, divisionId: division.id, isActive: row.isActive },
          })
          created++
        }
      } catch (err: any) {
        errors.push(`Row ${i + 1} (${row.email}): ${err.message}`)
      }
    }

    return reply.send({ results: { created, updated, errors } })
  })

  // List all users (for admin management)
  app.get('/admin/users', { preHandler: requireAdmin }, async (_req, reply) => {
    const users = await prisma.user.findMany({
      orderBy: { name: 'asc' },
      include: { player: { include: { division: true } } },
    })
    return reply.send({ users })
  })
}
