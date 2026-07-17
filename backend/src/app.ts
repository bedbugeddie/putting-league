import { STATUS_CODES } from 'node:http'
import Fastify, { FastifyInstance, FastifyServerOptions } from 'fastify'
import fastifyJwt from '@fastify/jwt'
import fastifyCors from '@fastify/cors'
import fastifyCookie from '@fastify/cookie'
import fastifyWebSocket from '@fastify/websocket'
import fastifyRateLimit from '@fastify/rate-limit'
import { ZodError } from 'zod'

import { env } from './config/env.js'

// Routes
import { authRoutes } from './routes/auth.js'
import { divisionRoutes } from './routes/admin/divisions.js'
import { seasonRoutes } from './routes/admin/seasons.js'
import { leagueNightRoutes } from './routes/admin/leagueNights.js'
import { playerRoutes } from './routes/admin/players.js'
import { scoringRoutes } from './routes/scoring.js'
import { leaderboardRoutes } from './routes/leaderboard.js'
import { statsRoutes } from './routes/stats.js'
import { wsRoutes } from './routes/ws.js'
import { checkInRoutes } from './routes/checkins.js'
import { cardRoutes } from './routes/cards.js'
import { payoutRoutes } from './routes/admin/payouts.js'
import { settingsRoutes } from './routes/admin/settings.js'
import { motwRoutes } from './routes/motw.js'
import { adminMotwRoutes } from './routes/admin/motw.js'
import { forumRoutes } from './routes/forum.js'
import { notificationRoutes } from './routes/notifications.js'

export interface BuildAppOptions {
  /** Pino logger config, or a boolean shorthand. Defaults to off — noisy in test output. */
  logger?: FastifyServerOptions['logger']
  /** Enable the @fastify/rate-limit plugin. Defaults to on, matching production. */
  rateLimit?: boolean
}

/**
 * Builds and registers a fully wired Fastify app (plugins + all routes) without
 * starting a listener. Shared by the production bootstrap (index.ts) and by
 * integration tests, which drive it via app.inject() instead of a real socket.
 */
export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false })

  // Every route validates its body/query with zod's schema.parse(), which throws a
  // ZodError synchronously on bad input. Without this handler that error falls through
  // to Fastify's default 500 handler — malformed client input would look like a server
  // crash to both the client and any error monitoring. Map it to the same `{ error }`
  // shape every other route in the app already uses for 4xx responses.
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      const message = error.issues
        .map(issue => (issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message))
        .join('; ')
      return reply.status(400).send({ error: message })
    }

    const statusCode = typeof error.statusCode === 'number' ? error.statusCode : 500
    if (statusCode >= 500) request.log.error(error)
    return reply.status(statusCode).send({
      statusCode,
      error: STATUS_CODES[statusCode] ?? 'Internal Server Error',
      message: error.message,
    })
  })

  // ── Plugins ──────────────────────────────────────────────────────────────────
  await app.register(fastifyCors, {
    origin: env.CORS_ORIGIN.split(',').map(s => s.trim()),
    credentials: true,
  })

  await app.register(fastifyCookie)

  await app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    cookie: { cookieName: 'token', signed: false },
  })

  if (opts.rateLimit ?? true) {
    await app.register(fastifyRateLimit, {
      max: 200,
      timeWindow: '1 minute',
    })
  }

  await app.register(fastifyWebSocket)

  // ── Routes ───────────────────────────────────────────────────────────────────
  await app.register(authRoutes)
  await app.register(divisionRoutes)
  await app.register(seasonRoutes)
  await app.register(leagueNightRoutes)
  await app.register(playerRoutes)
  await app.register(scoringRoutes)
  await app.register(leaderboardRoutes)
  await app.register(statsRoutes)
  await app.register(checkInRoutes)
  await app.register(cardRoutes)
  await app.register(payoutRoutes)
  await app.register(settingsRoutes)
  await app.register(motwRoutes)
  await app.register(adminMotwRoutes)
  await app.register(forumRoutes)
  await app.register(notificationRoutes)
  await app.register(wsRoutes)

  // ── Health check ─────────────────────────────────────────────────────────────
  app.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }))

  return app
}
