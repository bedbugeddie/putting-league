import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../middleware/auth.js'

const updatePrefsSchema = z.object({
  forumMode:  z.enum(['ALL', 'OWN_POSTS', 'ENGAGED', 'NONE']),
  digestMode: z.enum(['IMMEDIATE', 'DAILY']),
})

export async function notificationRoutes(app: FastifyInstance) {

  // GET /notifications/preferences — return current user's notification settings
  app.get('/notifications/preferences', { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.user!.userId
    const pref = await prisma.notificationPreference.findUnique({ where: { userId } })
    // Return defaults if no record exists yet
    return reply.send({
      preferences: {
        forumMode:  pref?.forumMode  ?? 'OWN_POSTS',
        digestMode: pref?.digestMode ?? 'IMMEDIATE',
      },
    })
  })

  // PUT /notifications/preferences — upsert user's notification settings
  app.put('/notifications/preferences', { preHandler: requireAuth }, async (req, reply) => {
    const userId = req.user!.userId
    const { forumMode, digestMode } = updatePrefsSchema.parse(req.body)

    const pref = await prisma.notificationPreference.upsert({
      where:  { userId },
      create: { userId, forumMode, digestMode },
      update: { forumMode, digestMode },
    })

    return reply.send({
      preferences: {
        forumMode:  pref.forumMode,
        digestMode: pref.digestMode,
      },
    })
  })
}
