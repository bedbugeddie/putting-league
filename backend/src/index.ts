import Fastify from 'fastify'
import fastifyJwt from '@fastify/jwt'
import fastifyCors from '@fastify/cors'
import fastifyCookie from '@fastify/cookie'
import fastifyWebSocket from '@fastify/websocket'
import fastifyRateLimit from '@fastify/rate-limit'

import { env } from './config/env.js'
import { prisma } from './lib/prisma.js'

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

const app = Fastify({
  logger: {
    level: env.NODE_ENV === 'production' ? 'warn' : 'info',
    transport: env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  },
})

async function bootstrap() {
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

  await app.register(fastifyRateLimit, {
    max: 200,
    timeWindow: '1 minute',
  })

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
  await app.register(wsRoutes)

  // ── Health check ─────────────────────────────────────────────────────────────
  app.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }))

  // ── Graceful shutdown ─────────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down…`)
    await app.close()
    await prisma.$disconnect()
    process.exit(0)
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  // ── Start ─────────────────────────────────────────────────────────────────────
  try {
    await app.listen({ port: env.PORT, host: env.HOST })
    app.log.info(`🚀 Server running on http://${env.HOST}:${env.PORT}`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

bootstrap()
