import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma.js'
import { buildTestApp, signToken, authHeader } from '../test/app.js'
import { resetDb, createUserWithPassword } from '../test/helpers.js'

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

describe('POST /auth/login', () => {
  it('logs in with the correct password and returns a token + user', async () => {
    const { user, password } = await createUserWithPassword({ email: 'a@example.com' })

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: user.email, password },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.token).toEqual(expect.any(String))
    expect(body.user.email).toBe(user.email)
    expect(body.user.passwordHash).toBeUndefined()
    expect(body.user.hasPassword).toBe(true)
  })

  it('rejects an unknown email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'nobody@example.com', password: 'whatever' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('rejects the wrong password', async () => {
    const { user } = await createUserWithPassword({ email: 'b@example.com' })
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: user.email, password: 'not-the-password' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('tells magic-link-only accounts to use a magic link instead', async () => {
    const user = await prisma.user.create({ data: { email: 'c@example.com', name: 'C' } })
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: user.email, password: 'anything' },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().noPassword).toBe(true)
  })

  it('auto-creates a player profile on first login if one is missing', async () => {
    const passwordHash = await bcrypt.hash('pw123456', 12)
    const user = await prisma.user.create({ data: { email: 'd@example.com', name: 'D', passwordHash } })
    const before = await prisma.player.findUnique({ where: { userId: user.id } })
    expect(before).toBeNull()

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: user.email, password: 'pw123456' },
    })
    expect(res.statusCode).toBe(200)

    const after = await prisma.player.findUnique({ where: { userId: user.id } })
    expect(after).not.toBeNull()
  })
})

describe('magic link flow (POST /auth/request → GET /auth/verify)', () => {
  it('creates a new user and a usable magic link token when name is supplied', async () => {
    const requestRes = await app.inject({
      method: 'POST',
      url: '/auth/request',
      payload: { email: 'newperson@example.com', name: 'New Person' },
    })
    expect(requestRes.statusCode).toBe(200)

    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'newperson@example.com' } })
    const tokenRow = await prisma.magicLinkToken.findFirstOrThrow({ where: { userId: user.id } })
    expect(tokenRow.used).toBe(false)

    const verifyRes = await app.inject({
      method: 'GET',
      url: `/auth/verify?token=${tokenRow.token}`,
    })
    expect(verifyRes.statusCode).toBe(200)
    const body = verifyRes.json()
    expect(body.user.email).toBe('newperson@example.com')
    expect(body.token).toEqual(expect.any(String))

    // Player auto-created
    const player = await prisma.player.findUnique({ where: { userId: user.id } })
    expect(player).not.toBeNull()
  })

  it('rejects requesting a link for a brand new email without a name', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/request',
      payload: { email: 'noname@example.com' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('rejects a token that has already been used', async () => {
    const user = await prisma.user.create({ data: { email: 'e@example.com', name: 'E' } })
    const tokenRow = await prisma.magicLinkToken.create({
      data: { token: 'used-token', userId: user.id, expiresAt: new Date(Date.now() + 60_000), used: true },
    })
    const res = await app.inject({ method: 'GET', url: `/auth/verify?token=${tokenRow.token}` })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/already used/i)
  })

  it('rejects an expired token', async () => {
    const user = await prisma.user.create({ data: { email: 'f@example.com', name: 'F' } })
    const tokenRow = await prisma.magicLinkToken.create({
      data: { token: 'expired-token', userId: user.id, expiresAt: new Date(Date.now() - 60_000) },
    })
    const res = await app.inject({ method: 'GET', url: `/auth/verify?token=${tokenRow.token}` })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatch(/expired/i)
  })

  it('rejects a token that does not exist', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/verify?token=does-not-exist' })
    expect(res.statusCode).toBe(400)
  })
})

describe('GET /auth/me', () => {
  it('requires authentication', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/me' })
    expect(res.statusCode).toBe(401)
  })

  it('returns the current user for a valid token', async () => {
    const { user } = await createUserWithPassword({ email: 'g@example.com' })
    const token = signToken(app, { userId: user.id, email: user.email, isAdmin: user.isAdmin })

    const res = await app.inject({ method: 'GET', url: '/auth/me', headers: authHeader(token) })
    expect(res.statusCode).toBe(200)
    expect(res.json().user.email).toBe('g@example.com')
    expect(res.json().user.passwordHash).toBeUndefined()
  })
})

describe('POST /auth/set-password', () => {
  it('sets a password for an account with none yet, no currentPassword required', async () => {
    const user = await prisma.user.create({ data: { email: 'h@example.com', name: 'H' } })
    const token = signToken(app, { userId: user.id, email: user.email, isAdmin: false })

    const res = await app.inject({
      method: 'POST', url: '/auth/set-password', headers: authHeader(token),
      payload: { newPassword: 'brand-new-password' },
    })
    expect(res.statusCode).toBe(200)

    const loginRes = await app.inject({
      method: 'POST', url: '/auth/login',
      payload: { email: user.email, password: 'brand-new-password' },
    })
    expect(loginRes.statusCode).toBe(200)
  })

  it('requires the current password when one is already set', async () => {
    const { user } = await createUserWithPassword({ email: 'i@example.com' })
    const token = signToken(app, { userId: user.id, email: user.email, isAdmin: false })

    const res = await app.inject({
      method: 'POST', url: '/auth/set-password', headers: authHeader(token),
      payload: { newPassword: 'another-new-password' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('rejects an incorrect current password', async () => {
    const { user } = await createUserWithPassword({ email: 'j@example.com' })
    const token = signToken(app, { userId: user.id, email: user.email, isAdmin: false })

    const res = await app.inject({
      method: 'POST', url: '/auth/set-password', headers: authHeader(token),
      payload: { currentPassword: 'wrong', newPassword: 'another-new-password' },
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('PATCH /auth/profile', () => {
  it('derives the display name from firstName/lastName/suffix', async () => {
    const { user } = await createUserWithPassword({ email: 'k@example.com' })
    const token = signToken(app, { userId: user.id, email: user.email, isAdmin: false })

    const res = await app.inject({
      method: 'PATCH', url: '/auth/profile', headers: authHeader(token),
      payload: { firstName: 'Jane', lastName: 'Doe', suffix: 'Jr.' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().user.name).toBe('Jane Doe Jr.')
  })

  it('rejects changing email to one already in use by another account', async () => {
    const { user: u1 } = await createUserWithPassword({ email: 'taken@example.com' })
    const { user: u2 } = await createUserWithPassword({ email: 'free@example.com' })
    const token = signToken(app, { userId: u2.id, email: u2.email, isAdmin: false })

    const res = await app.inject({
      method: 'PATCH', url: '/auth/profile', headers: authHeader(token),
      payload: { email: u1.email },
    })
    expect(res.statusCode).toBe(400)
  })
})
