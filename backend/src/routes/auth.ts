import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma.js'
import { sendMagicLink } from '../lib/email.js'
import { env } from '../config/env.js'
import { requireAuth } from '../middleware/auth.js'

const requestLinkSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100).optional(),
})

const verifySchema = z.object({
  token: z.string().min(1),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const setPasswordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
})

const updateProfileSchema = z.object({
  name:      z.string().min(1).max(100).optional(),
  firstName: z.string().min(1).max(60).optional(),
  lastName:  z.string().min(0).max(60).optional(),
  suffix:    z.string().max(20).nullable().optional(),
  email:     z.string().email().optional(),
})

/** Derive display name from parts when parts are provided. */
function computeName(firstName: string, lastName: string, suffix: string | null | undefined): string {
  const parts = [firstName.trim(), lastName.trim()].filter(Boolean)
  const base = parts.join(' ')
  return suffix ? `${base} ${suffix.trim()}` : base
}

/** Build the standard JWT + full user response used by all auth flows */
async function buildAuthResponse(app: FastifyInstance, userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { player: { include: { division: true } } },
  })
  if (!user) throw new Error('User not found')

  const jwt = app.jwt.sign(
    { userId: user.id, email: user.email, isAdmin: user.isAdmin },
    { expiresIn: env.JWT_EXPIRY }
  )
  // Strip passwordHash before sending to client, but expose a boolean flag
  const { passwordHash: _, ...safeUser } = user as any
  return { token: jwt, user: { ...safeUser, hasPassword: !!user.passwordHash } }
}

export async function authRoutes(app: FastifyInstance) {
  // POST /auth/login – sign in with email + password
  app.post('/auth/login', async (req, reply) => {
    const { email, password } = loginSchema.parse(req.body)

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) return reply.status(401).send({ error: 'Invalid email or password' })

    if (!user.passwordHash) {
      return reply.status(401).send({
        error: 'No password set for this account. Use a magic link to sign in.',
        noPassword: true,
      })
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return reply.status(401).send({ error: 'Invalid email or password' })

    // Auto-create player profile if missing
    const existingPlayer = await prisma.player.findUnique({ where: { userId: user.id } })
    if (!existingPlayer) await prisma.player.create({ data: { userId: user.id } })

    return reply.send(await buildAuthResponse(app, user.id))
  })

  // POST /auth/request – send magic link
  app.post('/auth/request', async (req, reply) => {
    const body = requestLinkSchema.parse(req.body)

    // Find or create user
    let user = await prisma.user.findUnique({ where: { email: body.email } })
    if (!user) {
      if (!body.name) {
        return reply.status(400).send({ error: 'name is required for new users' })
      }
      user = await prisma.user.create({
        data: { email: body.email, name: body.name },
      })
    }

    // Generate token
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + env.MAGIC_LINK_EXPIRY_MINUTES * 60 * 1000)

    await prisma.magicLinkToken.create({
      data: { token, userId: user.id, expiresAt },
    })

    await sendMagicLink(user.email, token, user.name)

    return reply.send({ message: 'Magic link sent. Check your email.' })
  })

  // GET /auth/verify?token=xxx – verify magic link token, return JWT
  app.get('/auth/verify', async (req, reply) => {
    const { token } = verifySchema.parse(req.query)

    const record = await prisma.magicLinkToken.findUnique({
      where: { token },
      include: { user: true },
    })

    if (!record) return reply.status(400).send({ error: 'Invalid token' })
    if (record.used) return reply.status(400).send({ error: 'Token already used' })
    if (record.expiresAt < new Date()) return reply.status(400).send({ error: 'Token expired' })

    await prisma.magicLinkToken.update({ where: { id: record.id }, data: { used: true } })

    // Auto-create player profile if missing
    const existingPlayer = await prisma.player.findUnique({ where: { userId: record.user.id } })
    if (!existingPlayer) await prisma.player.create({ data: { userId: record.user.id } })

    return reply.send(await buildAuthResponse(app, record.user.id))
  })

  // POST /auth/set-password – set or change password (requires login)
  app.post('/auth/set-password', { preHandler: requireAuth }, async (req, reply) => {
    const { currentPassword, newPassword } = setPasswordSchema.parse(req.body)

    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } })
    if (!user) return reply.status(404).send({ error: 'User not found' })

    // If a password already exists, require the current one
    if (user.passwordHash) {
      if (!currentPassword) {
        return reply.status(400).send({ error: 'Current password is required to set a new one' })
      }
      const valid = await bcrypt.compare(currentPassword, user.passwordHash)
      if (!valid) return reply.status(401).send({ error: 'Current password is incorrect' })
    }

    const passwordHash = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } })

    return reply.send({ message: 'Password updated successfully' })
  })

  // PATCH /auth/profile – update name and/or email
  app.patch('/auth/profile', { preHandler: requireAuth }, async (req, reply) => {
    const body = updateProfileSchema.parse(req.body)

    if (body.email) {
      const existing = await prisma.user.findUnique({ where: { email: body.email } })
      if (existing && existing.id !== req.user!.userId) {
        return reply.status(400).send({ error: 'That email address is already in use' })
      }
    }

    // When firstName/lastName are supplied, derive the display name from them.
    // If only a raw `name` string is supplied, keep the old behaviour.
    let nameUpdate: { name?: string; firstName?: string; lastName?: string; suffix?: string | null } = {}
    if (body.firstName !== undefined || body.lastName !== undefined) {
      const firstName = body.firstName ?? ''
      const lastName  = body.lastName  ?? ''
      const suffix    = body.suffix !== undefined ? body.suffix : null
      nameUpdate = {
        firstName,
        lastName,
        suffix,
        name: computeName(firstName, lastName, suffix),
      }
    } else if (body.name !== undefined) {
      nameUpdate = { name: body.name }
    }

    await prisma.user.update({
      where: { id: req.user!.userId },
      data: {
        ...nameUpdate,
        ...(body.email !== undefined ? { email: body.email } : {}),
      },
    })

    // Return a fresh JWT + user (email may have changed)
    return reply.send(await buildAuthResponse(app, req.user!.userId))
  })

  // PATCH /auth/avatar – upload or clear profile photo (base64 data URL)
  app.patch('/auth/avatar', { preHandler: requireAuth }, async (req, reply) => {
    const { dataUrl } = z.object({
      dataUrl: z.string()
        .refine(v => v === '' || /^data:image\/(jpeg|png|webp);base64,/.test(v), {
          message: 'Must be a valid image data URL (jpeg/png/webp)',
        })
        .nullable(),
    }).parse(req.body)

    // Enforce a 200 KB ceiling on the stored data URL
    if (dataUrl && dataUrl.length > 200_000) {
      return reply.status(400).send({ error: 'Image too large. Please use an image under 150 KB.' })
    }

    await prisma.user.update({
      where: { id: req.user!.userId },
      data: { avatarDataUrl: dataUrl || null },
    })

    return reply.send(await buildAuthResponse(app, req.user!.userId))
  })

  // PATCH /players/me – update division and/or PDGA number
  app.patch('/players/me', { preHandler: requireAuth }, async (req, reply) => {
    const body = z.object({
      divisionId: z.string().optional(),
      pdgaNumber: z.string().max(20).trim().nullable().optional(),
    }).parse(req.body)

    const player = await prisma.player.findUnique({ where: { userId: req.user!.userId } })
    if (!player) return reply.status(404).send({ error: 'Player profile not found' })

    // Verify the division exists and is active (only when provided)
    if (body.divisionId !== undefined) {
      const division = await prisma.division.findUnique({ where: { id: body.divisionId } })
      if (!division || !division.isActive) {
        return reply.status(400).send({ error: 'Invalid division' })
      }
    }

    await prisma.player.update({
      where: { id: player.id },
      data: {
        ...(body.divisionId !== undefined ? { divisionId: body.divisionId } : {}),
        ...(body.pdgaNumber !== undefined ? { pdgaNumber: body.pdgaNumber || null } : {}),
      },
    })

    // Return a fresh JWT + user
    return reply.send(await buildAuthResponse(app, req.user!.userId))
  })

  // GET /auth/me – return current user
  app.get('/auth/me', { preHandler: requireAuth }, async (req, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      include: { player: { include: { division: true } } },
    })
    if (!user) return reply.status(404).send({ error: 'User not found' })
    const { passwordHash: _, ...safeUser } = user as any
    return reply.send({ user: safeUser })
  })
}
