import { FastifyReply, FastifyRequest } from 'fastify'

// Require any authenticated user
export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify()
  } catch {
    return reply.status(401).send({ error: 'Unauthorized' })
  }
}

// Require admin flag
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify()
  } catch {
    return reply.status(401).send({ error: 'Unauthorized' })
  }
  if (!req.user?.isAdmin) {
    return reply.status(403).send({ error: 'Forbidden' })
  }
}

// Alias — card management and check-in overrides require admin
export { requireAdmin as requireScorekeeper }
