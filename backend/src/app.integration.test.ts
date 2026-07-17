import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { FastifyInstance } from 'fastify'
import { prisma } from './lib/prisma.js'
import { buildTestApp, signToken, authHeader } from './test/app.js'
import { resetDb } from './test/helpers.js'

let app: FastifyInstance

beforeAll(async () => {
  app = await buildTestApp()
  await app.ready()
})

beforeEach(async () => {
  await resetDb()
})

afterAll(async () => {
  await app.close()
  await prisma.$disconnect()
})

describe('global zod error handler', () => {
  it('maps a zod validation failure to a 400 with the standard { error } shape', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/request',
      payload: { email: 'not-an-email', name: 'Someone' },
    })

    expect(res.statusCode).toBe(400)
    const body = res.json()
    expect(body).toHaveProperty('error')
    expect(typeof body.error).toBe('string')
    expect(body.error).toMatch(/email/i)
    // Not the raw Fastify default-error shape (no statusCode/message leaking a Zod issue dump)
    expect(body.statusCode).toBeUndefined()
  })

  it('joins multiple validation issues into one readable message', async () => {
    const token = signToken(app, { userId: 'admin', email: 'admin@example.com', isAdmin: true })
    const res = await app.inject({
      method: 'POST',
      url: '/admin/divisions',
      headers: authHeader(token),
      payload: {}, // missing required `code` and `name`
    })

    expect(res.statusCode).toBe(400)
    const message = res.json().error
    expect(message).toMatch(/code/)
    expect(message).toMatch(/name/)
  })

  it('does not intercept non-zod errors — an unexpected exception still surfaces as a 500', async () => {
    const token = signToken(app, { userId: 'user-1', email: 'u@example.com', isAdmin: false })
    // recordPuttOffRound calls prisma.puttOff.findUniqueOrThrow, which throws a
    // PrismaClientKnownRequestError (not a ZodError) for an id that doesn't exist.
    const res = await app.inject({
      method: 'POST',
      url: '/scoring/putt-offs/does-not-exist/round',
      headers: authHeader(token),
      payload: { scores: [{ playerId: 'cktest00000000000000000', made: 2 }] },
    })

    expect(res.statusCode).toBe(500)
    expect(res.json().error).toBe('Internal Server Error')
  })
})
