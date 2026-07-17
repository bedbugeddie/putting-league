import { FastifyInstance } from 'fastify'
import { buildApp, BuildAppOptions } from '../app.js'

/** Builds an app instance suited for inject()-driven integration tests: quiet, no rate limiting. */
export async function buildTestApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  return buildApp({ logger: false, rateLimit: false, ...opts })
}

/** Mints a valid JWT for a user without going through a login/magic-link route. */
export function signToken(
  app: FastifyInstance,
  payload: { userId: string; email: string; isAdmin: boolean }
): string {
  return app.jwt.sign(payload, { expiresIn: '1h' })
}

export function authHeader(token: string) {
  return { authorization: `Bearer ${token}` }
}
