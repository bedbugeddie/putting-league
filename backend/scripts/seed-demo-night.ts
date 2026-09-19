/**
 * seed-demo-night.ts
 *
 * Fills in MISSING scores for an existing league night so it has a complete
 * scorecard for a demo — WITHOUT touching any score that already exists.
 *
 * NON-DESTRUCTIVE BY DESIGN (safe for a live event with real scores):
 *   - Never deletes or overwrites an existing Score. Only inserts the
 *     (player × hole × round × position) rows that are currently missing.
 *   - Does NOT change the night's status and does NOT mark rounds complete
 *     (unless you explicitly pass SET_COMPLETED=true).
 *   - Defaults to a DRY RUN: prints exactly what it would insert and writes
 *     nothing. Pass APPLY=true to actually write.
 *
 * Who gets filled (SCOPE):
 *   - "checkedin" (default): only players already checked in to the night —
 *     the real participants. Fills each one's missing stations. Never invents
 *     participants.
 *   - "roster": also ensures every player on the built-in roster is present
 *     (creates User+Player if missing, checks them in) and fills them. Use
 *     this only if the demo needs the whole roster on the board.
 *
 * Scoring uses the CURRENT format: `made` is 0..3, `bonus` is true on a
 * 3-for-3 (matches upsertScore + calcLeagueNightTotals). Numbers are
 * generated deterministically (seeded RNG) so re-runs reproduce.
 *
 * Usage:
 *   # 1) See what it WOULD do (writes nothing):
 *   DATABASE_URL="postgresql://league:<pw>@<host>:5432/league_db" \
 *     NIGHT_ID="<leagueNightId>" \
 *     npx tsx backend/scripts/seed-demo-night.ts
 *
 *   # 2) Actually fill the gaps:
 *   DATABASE_URL="..." NIGHT_ID="..." APPLY=true \
 *     npx tsx backend/scripts/seed-demo-night.ts
 *
 *   # Options:
 *   #   SCOPE=roster        include the full built-in roster (default: checkedin)
 *   #   SET_COMPLETED=true  also mark rounds complete + night COMPLETED
 *   #   SEED=<int>          vary the generated numbers
 */

import { PrismaClient, Position } from '@prisma/client'

const DB_URL = process.env.DATABASE_URL || process.env.PROD_DB_URL
if (!DB_URL) {
  console.error('Error: set DATABASE_URL (or PROD_DB_URL) to the target database')
  process.exit(1)
}

const NIGHT_ID = process.env.NIGHT_ID || process.argv[2]
if (!NIGHT_ID) {
  console.error('Error: set NIGHT_ID env var or pass the league night id as the first arg')
  process.exit(1)
}

const APPLY = /^(1|true|yes)$/i.test(process.env.APPLY ?? '')
const SET_COMPLETED = /^(1|true|yes)$/i.test(process.env.SET_COMPLETED ?? '')
const SCOPE = (process.env.SCOPE ?? 'checkedin').toLowerCase() // 'checkedin' | 'roster'
const SEED = Number(process.env.SEED ?? 20260919)

const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } })

// ── Seeded RNG (mulberry32) — deterministic across runs ─────────────────────
function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rng = makeRng(SEED)

// Per-station make probability by division skill and putt distance.
// A station is 3 putts; each putt made with prob p → made ~ Binomial(3, p),
// so bonus (3-for-3) falls out naturally at p^3.
const MAKE_PROB: Record<string, { SHORT: number; LONG: number }> = {
  AAA: { SHORT: 0.82, LONG: 0.62 },
  BBB: { SHORT: 0.72, LONG: 0.5 },
  CCC: { SHORT: 0.6, LONG: 0.4 },
  DDD: { SHORT: 0.66, LONG: 0.46 },
}
const FALLBACK_PROB = { SHORT: 0.65, LONG: 0.45 }

function generateMade(divisionCode: string | null, position: Position): number {
  const key = position === Position.SHORT ? 'SHORT' : 'LONG'
  const p = (MAKE_PROB[divisionCode ?? ''] ?? FALLBACK_PROB)[key]
  let made = 0
  for (let i = 0; i < 3; i++) if (rng() < p) made++
  return made // 0..3
}

// ── Roster (real players) — only used when SCOPE=roster ─────────────────────
type RosterEntry = { name: string; division: string; pdga?: string }

const NAME_ALIASES: Record<string, string> = {
  'Michael Sullivan': 'Mike Sullivan',
  'William Baldridge': 'Bill Baldridge',
  'Joey Westhoff': 'Joseph Westhoff',
  'Jim Lewis Jr': 'Jim Lewis',
  'Craig Kimberley': 'Craig Kimberly',
  Coppola: 'Andrew Coppola',
  Danimal: 'Dan Tringale',
}

const ROSTER: RosterEntry[] = [
  { name: 'Greg Bianco', division: 'AAA' },
  { name: 'Alan Chambers', division: 'AAA', pdga: '90684' },
  { name: 'Michael Chambers', division: 'AAA', pdga: '155123' },
  { name: 'Michael Sullivan', division: 'AAA', pdga: '132606' },
  { name: 'Connor Glasier', division: 'AAA' },
  { name: 'Cody Souza-Ladden', division: 'AAA', pdga: '214661' },
  { name: 'TJ Scanlon', division: 'AAA', pdga: '272588' },
  { name: 'Craig Kimberley', division: 'AAA', pdga: '14964' },
  { name: 'Coppola', division: 'AAA', pdga: '101204' },
  { name: 'Jonathan Sawin', division: 'AAA', pdga: '247239' },
  { name: 'William Baldridge', division: 'AAA', pdga: '194789' },
  { name: 'Jason Osterberg', division: 'AAA' },
  { name: 'Zachery Taylor', division: 'AAA', pdga: '253729' },
  { name: 'Josh Graning', division: 'AAA', pdga: '209741' },
  { name: 'Rick Lopez', division: 'AAA', pdga: '215678' },
  { name: 'Jeremy Jacobs', division: 'AAA', pdga: '184618' },
  { name: 'Ryan Tripp', division: 'AAA', pdga: '179839' },
  { name: 'Al Ashcraft', division: 'BBB', pdga: '78218' },
  { name: 'Ben Lopez', division: 'BBB' },
  { name: 'Danimal', division: 'BBB' },
  { name: 'Joey Westhoff', division: 'BBB', pdga: '151475' },
  { name: 'Dan DeRoche', division: 'BBB' },
  { name: 'Sean Stanford', division: 'BBB' },
  { name: 'Renee Bastarache', division: 'CCC' },
  { name: 'Kasia Czuba', division: 'CCC' },
  { name: 'Ashley Smith-Boutin', division: 'CCC' },
  { name: 'Samantha Miller', division: 'CCC' },
  { name: 'Roseanne Ham', division: 'CCC', pdga: '161537' },
  { name: 'Lindsay Janeiro', division: 'CCC', pdga: '246932' },
  { name: 'Christy Viccaro', division: 'CCC', pdga: '291932' },
  { name: 'Dee Tripp', division: 'CCC', pdga: '190389' },
  { name: 'Katie Alex', division: 'CCC' },
  { name: 'Allie Lawler', division: 'CCC', pdga: '227026' },
  { name: 'Kayla Holler', division: 'CCC' },
  { name: 'Eric Faulkner', division: 'DDD', pdga: '321062' },
  { name: 'David Driscoll', division: 'DDD' },
  { name: 'Robert Williams', division: 'DDD', pdga: '251926' },
  { name: 'Tom Scanlon', division: 'DDD', pdga: '287268' },
  { name: 'Jim Lewis Jr', division: 'DDD', pdga: '159538' },
]

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
function fakeEmail(name: string): string {
  return `${slugify(name)}@player.mvpl.golf`
}

type Target = { playerId: string; name: string; divisionCode: string | null }

async function resolveRosterTargets(divisionMap: Map<string, string>): Promise<Target[]> {
  const targets: Target[] = []
  for (const entry of ROSTER) {
    const candidates = [entry.name, NAME_ALIASES[entry.name]].filter(Boolean) as string[]
    let playerId: string | undefined
    for (const name of candidates) {
      const user = await prisma.user.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } },
        include: { player: true },
      })
      if (user?.player) {
        playerId = user.player.id
        break
      }
    }
    if (!playerId) {
      const parts = entry.name.split(' ')
      if (!APPLY) {
        console.log(`    (would create player: ${entry.name})`)
        continue // nothing to write in dry run; skip filling a not-yet-created player
      }
      const user = await prisma.user.create({
        data: {
          email: fakeEmail(entry.name),
          name: entry.name,
          firstName: parts[0],
          lastName: parts.slice(1).join(' ') || null,
          player: {
            create: {
              divisionId: divisionMap.get(entry.division) ?? null,
              pdgaNumber: entry.pdga ?? null,
              isActive: true,
            },
          },
        },
        include: { player: true },
      })
      playerId = user.player!.id
      console.log(`    ➕ Created player: ${entry.name}`)
    }
    targets.push({ playerId, name: entry.name, divisionCode: entry.division })
  }
  return targets
}

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (writing)' : 'DRY RUN (no writes)'} · Scope: ${SCOPE}`)
  await prisma.$connect()

  const night = await prisma.leagueNight.findUnique({
    where: { id: NIGHT_ID },
    include: {
      holes: { orderBy: { number: 'asc' } },
      rounds: { orderBy: { number: 'asc' } },
    },
  })
  if (!night) throw new Error(`League night ${NIGHT_ID} not found`)
  console.log(`Night: ${night.date.toISOString().slice(0, 10)} (${night.status})`)
  console.log(`  Holes: ${night.holes.length}, Rounds: ${night.rounds.length}`)
  if (night.holes.length === 0 || night.rounds.length === 0) {
    throw new Error('Night has no holes or rounds — refusing to guess a layout for a live event')
  }
  const { holes, rounds } = night

  const divisions = await prisma.division.findMany()
  const divisionMap = new Map(divisions.map(d => [d.code, d.id]))
  const divisionCodeById = new Map(divisions.map(d => [d.id, d.code]))

  // ── Existing scores — the source of truth we must not disturb ───────────────
  const existing = await prisma.score.findMany({
    where: { hole: { leagueNightId: NIGHT_ID } },
    include: { player: { include: { user: true, division: true } } },
  })
  const existingKeys = new Set(
    existing.map(s => `${s.playerId}|${s.holeId}|${s.roundId}|${s.position}`),
  )
  console.log(`\nExisting scores: ${existing.length} (these will NOT be changed)`)

  // Running totals per player, seeded from existing scores (final = existing + inserts).
  const totals = new Map<string, { name: string; division: string | null; total: number }>()
  for (const s of existing) {
    const t = totals.get(s.playerId) ?? {
      name: s.player.user.name,
      division: s.player.division?.code ?? null,
      total: 0,
    }
    t.total += s.made + (s.bonus ? 1 : 0)
    totals.set(s.playerId, t)
  }

  // ── Determine target players ─────────────────────────────────────────────────
  let targets: Target[]
  if (SCOPE === 'roster') {
    targets = await resolveRosterTargets(divisionMap)
  } else {
    const checkIns = await prisma.checkIn.findMany({
      where: { leagueNightId: NIGHT_ID },
      include: { player: { include: { user: true, division: true } } },
    })
    targets = checkIns.map(c => ({
      playerId: c.playerId,
      name: c.player.user.name,
      divisionCode:
        c.player.division?.code ?? (c.divisionId ? divisionCodeById.get(c.divisionId) ?? null : null),
    }))
    console.log(`Checked-in players: ${targets.length}`)
  }

  // ── Compute the missing rows ────────────────────────────────────────────────
  const toInsert: {
    playerId: string
    holeId: string
    roundId: string
    position: Position
    made: number
    bonus: boolean
  }[] = []

  for (const target of targets) {
    let filledForPlayer = 0
    for (const round of rounds) {
      for (const hole of holes) {
        for (const position of [Position.SHORT, Position.LONG]) {
          const key = `${target.playerId}|${hole.id}|${round.id}|${position}`
          if (existingKeys.has(key)) continue
          const made = generateMade(target.divisionCode, position)
          const bonus = made === 3
          toInsert.push({ playerId: target.playerId, holeId: hole.id, roundId: round.id, position, made, bonus })
          filledForPlayer++
          const t = totals.get(target.playerId) ?? { name: target.name, division: target.divisionCode, total: 0 }
          t.total += made + (bonus ? 1 : 0)
          totals.set(target.playerId, t)
        }
      }
    }
    if (filledForPlayer > 0) {
      console.log(`  ${APPLY ? 'fill' : 'would fill'} ${String(filledForPlayer).padStart(2)} rows — ${target.name} (${target.divisionCode ?? '?'})`)
    }
  }

  const stationsPerPlayer = holes.length * rounds.length * 2
  console.log(`\nMissing rows to insert: ${toInsert.length} (full night = ${stationsPerPlayer}/player)`)

  // ── Write (or not) ───────────────────────────────────────────────────────────
  if (!APPLY) {
    console.log('\nDRY RUN — nothing was written. Re-run with APPLY=true to insert.')
  } else if (toInsert.length === 0) {
    console.log('\nNothing to insert — every target station already has a score.')
  } else {
    const res = await prisma.score.createMany({ data: toInsert, skipDuplicates: true })
    console.log(`\n✓ Inserted ${res.count} score rows (existing scores untouched)`)
    if (SET_COMPLETED) {
      await prisma.round.updateMany({ where: { leagueNightId: NIGHT_ID }, data: { isComplete: true } })
      await prisma.leagueNight.update({ where: { id: NIGHT_ID }, data: { status: 'COMPLETED' } })
      console.log('✓ Rounds marked complete, night status → COMPLETED')
    }
  }

  // ── Leaderboard preview (final state = existing + planned/inserted) ──────────
  console.log('\n─── Leaderboard preview (existing + filled) ─────────')
  const byDiv = new Map<string, { name: string; total: number }[]>()
  for (const t of totals.values()) {
    const code = t.division ?? '??'
    if (!byDiv.has(code)) byDiv.set(code, [])
    byDiv.get(code)!.push({ name: t.name, total: t.total })
  }
  for (const code of [...byDiv.keys()].sort()) {
    const rows = byDiv.get(code)!
    rows.sort((a, b) => b.total - a.total)
    console.log(`\n  ${code}`)
    rows.forEach((r, i) => console.log(`    ${String(i + 1).padStart(2)}. ${r.name.padEnd(22)} ${r.total}`))
  }

  console.log(`\n${APPLY ? '✅ Done' : 'ℹ️  Dry run complete'} · Seed: ${SEED}`)
  await prisma.$disconnect()
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
