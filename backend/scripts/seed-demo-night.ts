/**
 * seed-demo-night.ts
 *
 * Populates an EXISTING league night with a full set of demo scores for every
 * player on the real roster, so the app has a complete, finished night to show
 * off in a demo.
 *
 * What it does (all idempotent — safe to re-run):
 *   - Resolves the target night (must already exist) and its holes/rounds.
 *     If the night has no holes/rounds yet, creates a default 6 holes / 2 rounds.
 *   - Finds or creates each roster player (User + Player), matching on name.
 *   - Checks each player in (skips if already checked in), marked hasPaid.
 *   - Deletes any existing scores for the night, then inserts a fresh, complete
 *     set for every player: one Score per hole × round × position (SHORT/LONG).
 *   - Uses the CURRENT scoring format: `made` is 0..3 and `bonus` is true on a
 *     3-for-3 (matches upsertScore + calcLeagueNightTotals).
 *   - Marks all rounds complete and the night status → COMPLETED.
 *   - Prints a per-division leaderboard so you can eyeball the result.
 *
 * Scores are generated deterministically (seeded RNG) so re-runs reproduce the
 * same numbers. Change SEED to get a different-but-realistic set.
 *
 * Usage:
 *   DATABASE_URL="postgresql://league:<pw>@<host>:5432/league_db" \
 *     NIGHT_ID="<leagueNightId>" \
 *     npx tsx backend/scripts/seed-demo-night.ts
 *
 *   # NIGHT_ID may also be passed as the first CLI arg:
 *   DATABASE_URL="..." npx tsx backend/scripts/seed-demo-night.ts <leagueNightId>
 *
 *   # Optional: SEED=<int> to vary the generated scores;
 *   # DEFAULT_HOLES / DEFAULT_ROUNDS to change the fallback layout.
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

const SEED = Number(process.env.SEED ?? 20260919)
const DEFAULT_HOLES = Number(process.env.DEFAULT_HOLES ?? 6)
const DEFAULT_ROUNDS = Number(process.env.DEFAULT_ROUNDS ?? 2)

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

function generateMade(divisionCode: string, position: 'SHORT' | 'LONG'): number {
  const p = (MAKE_PROB[divisionCode] ?? FALLBACK_PROB)[position]
  let made = 0
  for (let i = 0; i < 3; i++) if (rng() < p) made++
  return made // 0..3
}

// ── Roster (real players) — name, division, PDGA number ─────────────────────
type RosterEntry = { name: string; division: string; pdga?: string }

// Name aliases: roster name → how it may already be stored in the DB
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
  // ── AAA ──────────────────────────────────────────────────────────────────
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

  // ── BBB ──────────────────────────────────────────────────────────────────
  { name: 'Al Ashcraft', division: 'BBB', pdga: '78218' },
  { name: 'Ben Lopez', division: 'BBB' },
  { name: 'Danimal', division: 'BBB' },
  { name: 'Joey Westhoff', division: 'BBB', pdga: '151475' },
  { name: 'Dan DeRoche', division: 'BBB' },
  { name: 'Sean Stanford', division: 'BBB' },

  // ── CCC ──────────────────────────────────────────────────────────────────
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

  // ── DDD ──────────────────────────────────────────────────────────────────
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

async function findOrCreatePlayer(
  entry: RosterEntry,
  divisionMap: Map<string, string>,
): Promise<string> {
  const candidates = [entry.name, NAME_ALIASES[entry.name]].filter(Boolean) as string[]

  for (const name of candidates) {
    const user = await prisma.user.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      include: { player: true },
    })
    if (user?.player) return user.player.id
  }

  const parts = entry.name.split(' ')
  const firstName = parts[0]
  const lastName = parts.slice(1).join(' ') || null
  const email = fakeEmail(entry.name)

  console.log(`    ➕ Creating new player: ${entry.name} <${email}>`)

  const user = await prisma.user.create({
    data: {
      email,
      name: entry.name,
      firstName,
      lastName,
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

  return user.player!.id
}

async function main() {
  console.log(`Connecting to database…`)
  await prisma.$connect()

  // ── Resolve the night ──────────────────────────────────────────────────────
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

  // ── Create default holes/rounds if the night has none ──────────────────────
  let holes = night.holes
  if (holes.length === 0) {
    console.log(`  No holes — creating ${DEFAULT_HOLES}`)
    await prisma.hole.createMany({
      data: Array.from({ length: DEFAULT_HOLES }, (_, i) => ({
        leagueNightId: NIGHT_ID,
        number: i + 1,
      })),
    })
    holes = await prisma.hole.findMany({
      where: { leagueNightId: NIGHT_ID },
      orderBy: { number: 'asc' },
    })
  }

  let rounds = night.rounds
  if (rounds.length === 0) {
    console.log(`  No rounds — creating ${DEFAULT_ROUNDS}`)
    await prisma.round.createMany({
      data: Array.from({ length: DEFAULT_ROUNDS }, (_, i) => ({
        leagueNightId: NIGHT_ID,
        number: i + 1,
      })),
    })
    rounds = await prisma.round.findMany({
      where: { leagueNightId: NIGHT_ID },
      orderBy: { number: 'asc' },
    })
  }

  // ── Division map ────────────────────────────────────────────────────────────
  const divisions = await prisma.division.findMany()
  const divisionMap = new Map(divisions.map(d => [d.code, d.id]))
  for (const code of new Set(ROSTER.map(r => r.division))) {
    if (!divisionMap.has(code)) throw new Error(`Division ${code} not found — run the seed first`)
  }

  // ── Existing check-ins (skip duplicates) ────────────────────────────────────
  const existingCheckIns = await prisma.checkIn.findMany({
    where: { leagueNightId: NIGHT_ID },
    select: { playerId: true },
  })
  const checkedIn = new Set(existingCheckIns.map(c => c.playerId))
  console.log(`\nExisting check-ins: ${checkedIn.size}`)

  // ── Wipe existing scores so we insert a clean, complete set ──────────────────
  const deleted = await prisma.score.deleteMany({ where: { hole: { leagueNightId: NIGHT_ID } } })
  console.log(`Deleted ${deleted.count} existing scores (will be regenerated)`)

  // ── Players → check-ins + scores ─────────────────────────────────────────────
  console.log('\nProcessing players…')
  let ciCreated = 0
  let scoreRows = 0

  // Accumulate a per-player total for the leaderboard summary.
  const summary: { name: string; division: string; total: number }[] = []

  for (const entry of ROSTER) {
    const playerId = await findOrCreatePlayer(entry, divisionMap)
    const divisionId = divisionMap.get(entry.division) ?? null

    if (!checkedIn.has(playerId)) {
      await prisma.checkIn.create({
        data: { leagueNightId: NIGHT_ID, playerId, divisionId, hasPaid: true },
      })
      ciCreated++
    }

    let playerTotal = 0
    const data: {
      playerId: string
      holeId: string
      roundId: string
      position: Position
      made: number
      bonus: boolean
    }[] = []

    for (const round of rounds) {
      for (const hole of holes) {
        for (const position of [Position.SHORT, Position.LONG]) {
          const made = generateMade(entry.division, position)
          const bonus = made === 3
          data.push({ playerId, holeId: hole.id, roundId: round.id, position, made, bonus })
          playerTotal += made + (bonus ? 1 : 0)
        }
      }
    }

    await prisma.score.createMany({ data })
    scoreRows += data.length
    summary.push({ name: entry.name, division: entry.division, total: playerTotal })
    console.log(`  ✓ ${entry.name} (${entry.division}) — total ${playerTotal} (${data.length} rows)`)
  }

  // ── Mark rounds complete + night COMPLETED ───────────────────────────────────
  await prisma.round.updateMany({
    where: { leagueNightId: NIGHT_ID },
    data: { isComplete: true },
  })
  await prisma.leagueNight.update({
    where: { id: NIGHT_ID },
    data: { status: 'COMPLETED' },
  })
  console.log('\n✓ Rounds marked complete, night status → COMPLETED')

  // ── Leaderboard preview (matches calcLeagueNightTotals math) ─────────────────
  console.log('\n─── Leaderboard preview ─────────────────────────────')
  const byDiv = new Map<string, { name: string; total: number }[]>()
  for (const s of summary) {
    if (!byDiv.has(s.division)) byDiv.set(s.division, [])
    byDiv.get(s.division)!.push({ name: s.name, total: s.total })
  }
  for (const code of ['AAA', 'BBB', 'CCC', 'DDD']) {
    const rows = byDiv.get(code)
    if (!rows) continue
    rows.sort((a, b) => b.total - a.total)
    console.log(`\n  ${code}`)
    rows.forEach((r, i) => console.log(`    ${String(i + 1).padStart(2)}. ${r.name.padEnd(22)} ${r.total}`))
  }

  console.log(`\n✅ Done — ${ciCreated} new check-ins, ${scoreRows} score rows across ${ROSTER.length} players`)
  console.log(`   Holes: ${holes.length}, Rounds: ${rounds.length}, Seed: ${SEED}`)

  await prisma.$disconnect()
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
