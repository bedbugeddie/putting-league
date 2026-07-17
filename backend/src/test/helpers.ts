import { prisma } from '../lib/prisma.js'
import { Position } from '@prisma/client'

/** Truncate all app tables. Call in beforeEach for test isolation. */
export async function resetDb() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "ScoreAuditLog", "PuttOffParticipant", "PuttOff", "CardPlayer", "Card",
      "CheckIn", "Score", "Hole", "Round", "ScorekeeperAssignment",
      "MagicLinkToken", "ForumReaction", "ForumComment", "ForumPost",
      "PendingDigestItem", "NotificationPreference", "Player", "User",
      "LeagueNight", "Season", "Division", "Settings", "Motd"
    CASCADE;
  `)
}

let counter = 0
function uniq(prefix: string) {
  counter += 1
  return `${prefix}${counter}`
}

export async function createDivision(overrides: Partial<{ code: string; name: string; sortOrder: number; entryFee: number }> = {}) {
  const code = overrides.code ?? uniq('DIV')
  return prisma.division.create({
    data: {
      code,
      name: overrides.name ?? code,
      sortOrder: overrides.sortOrder ?? 0,
      entryFee: overrides.entryFee ?? 8,
    },
  })
}

export async function createPlayer(divisionId: string | null, overrides: Partial<{ name: string; email: string }> = {}) {
  const name = overrides.name ?? uniq('Player')
  const user = await prisma.user.create({
    data: {
      email: overrides.email ?? `${uniq('user')}@example.com`,
      name,
    },
  })
  const player = await prisma.player.create({
    data: { userId: user.id, divisionId },
  })
  return { user, player }
}

export async function createSeason(overrides: Partial<{ name: string; isActive: boolean }> = {}) {
  return prisma.season.create({
    data: {
      name: overrides.name ?? uniq('Season'),
      startDate: new Date('2026-01-01'),
      isActive: overrides.isActive ?? true,
    },
  })
}

export async function createLeagueNight(seasonId: string, overrides: Partial<{ status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'; tieBreakerMode: 'SPLIT' | 'PUTT_OFF'; date: Date }> = {}) {
  return prisma.leagueNight.create({
    data: {
      seasonId,
      date: overrides.date ?? new Date('2026-02-01'),
      status: overrides.status ?? 'IN_PROGRESS',
      tieBreakerMode: overrides.tieBreakerMode ?? 'SPLIT',
    },
  })
}

export async function createHole(leagueNightId: string, number: number) {
  return prisma.hole.create({ data: { leagueNightId, number } })
}

export async function createRound(leagueNightId: string, number: number) {
  return prisma.round.create({ data: { leagueNightId, number } })
}

export async function createScore(params: {
  playerId: string
  holeId: string
  roundId: string
  position: Position
  made: number
  bonus?: boolean
  enteredBy?: string | null
}) {
  return prisma.score.create({
    data: {
      playerId: params.playerId,
      holeId: params.holeId,
      roundId: params.roundId,
      position: params.position,
      made: params.made,
      bonus: params.bonus ?? params.made === 3,
      enteredBy: params.enteredBy ?? null,
    },
  })
}

/** Poll a condition until it's truthy or the timeout elapses. Useful for asserting on fire-and-forget async work. */
export async function waitFor<T>(fn: () => Promise<T | null | undefined>, { timeoutMs = 2000, intervalMs = 25 } = {}): Promise<T> {
  const start = Date.now()
  for (;;) {
    const result = await fn()
    if (result) return result
    if (Date.now() - start > timeoutMs) throw new Error('waitFor: timed out')
    await new Promise(r => setTimeout(r, intervalMs))
  }
}
