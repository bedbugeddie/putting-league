import { env } from './config/env.js'
import { prisma } from './lib/prisma.js'
import { buildApp } from './app.js'
import { sendPendingDigests } from './lib/forumNotifications.js'

async function bootstrap() {
  const app = await buildApp({
    logger: {
      level: env.NODE_ENV === 'production' ? 'warn' : 'info',
      transport: env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    },
  })

  // ── Daily digest scheduler ────────────────────────────────────────────────────
  // Check once per hour; sends to users whose last digest was >20h ago
  const digestInterval = setInterval(async () => {
    try {
      await sendPendingDigests()
    } catch (err) {
      app.log.error({ err }, 'Digest scheduler error')
    }
  }, 60 * 60 * 1000)
  // Run once at startup too, in case any digests are due
  sendPendingDigests().catch(err => app.log.error({ err }, 'Startup digest error'))

  // ── Graceful shutdown ─────────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down…`)
    clearInterval(digestInterval)
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
