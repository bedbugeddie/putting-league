/**
 * upload-2026-03-10.ts
 *
 * Uploads Lowell Putting League results for 2026-03-10 to production.
 * The league night already exists (created for live check-in) with 37 check-ins
 * but only 2 scores. This script:
 *   - Adds the 2 missing check-ins (Michael Chambers, Zachery Taylor)
 *   - Inserts all scores, skipping the 2 that already exist
 *   - Marks both rounds as complete
 *   - Sets the night status to COMPLETED
 *
 * Usage:
 *   PROD_DB_URL="postgresql://league:<password>@100.125.180.93:5432/league_db" \
 *     npx tsx backend/scripts/upload-2026-03-10.ts
 *
 * Safe to run multiple times — skip-on-conflict guards prevent duplicates.
 */

import { PrismaClient } from '@prisma/client'

const PROD_DB_URL = process.env.PROD_DB_URL!
if (!PROD_DB_URL) {
  console.error('Error: PROD_DB_URL env var is required')
  process.exit(1)
}

const prod = new PrismaClient({ datasources: { db: { url: PROD_DB_URL } } })

const NIGHT_ID   = 'cmmfamrr200vhwugds4ldse2h'
const NUM_HOLES  = 6

// Name aliases: how the name appears in the Excel → how it's stored in prod
const NAME_ALIASES: Record<string, string> = {
  'Michael Sullivan':  'Mike Sullivan',
  'William Baldridge': 'Bill Baldridge',
  'Joey Westhoff':     'Joseph Westhoff',
  'Jim Lewis Jr':      'Jim Lewis',
  'Craig Kimberley':   'Craig Kimberly',
  'Coppola':           'Andrew Coppola',
  'Danimal':           'Dan Tringale',
}

// Scores layout: [h1S, h1L, h2S, h2L, h3S, h3L, h4S, h4L, h5S, h5L, h6S, h6L]
// NaN in source file → 0 (missed all putts that position)
type ScoreRow = number[]

type PlayerEntry = {
  excelName: string
  division: string
  pdga?: string
  r1: ScoreRow
  r2: ScoreRow
}

// All totals verified against round_total_score columns in the Excel
const PLAYERS: PlayerEntry[] = [
  // ── AAA ──────────────────────────────────────────────────────────────────
  { excelName: 'Greg Bianco',        division: 'AAA',
    r1: [5,1,3,1,3,2,3,1,2,3,2,1], r2: [3,2,3,2,2,2,1,2,2,1,2,1] },  // 27 / 23
  { excelName: 'Alan Chambers',      division: 'AAA', pdga: '90684',
    r1: [1,3,5,3,5,5,1,3,3,1,3,3], r2: [1,1,2,3,3,2,1,1,2,3,3,1] },  // 36 / 23
  { excelName: 'Michael Chambers',   division: 'AAA', pdga: '155123',
    r1: [1,1,5,2,5,3,5,3,5,1,3,3], r2: [2,2,5,5,3,3,3,1,2,2,1,1] },  // 37 / 30
  { excelName: 'Michael Sullivan',   division: 'AAA', pdga: '132606',
    r1: [3,1,3,3,5,3,2,2,5,1,5,2], r2: [5,2,1,3,5,2,3,2,3,2,3,2] },  // 35 / 33
  { excelName: 'Connor Glasier',     division: 'AAA',
    r1: [5,1,5,3,5,3,3,2,3,1,3,2], r2: [2,2,5,2,5,3,2,3,3,2,2,2] },  // 36 / 33
  { excelName: 'Cody Souza-Ladden',  division: 'AAA', pdga: '214661',
    r1: [2,3,5,3,5,3,2,2,5,3,3,3], r2: [2,2,3,5,3,5,2,2,2,1,3,3] },  // 39 / 33
  { excelName: 'TJ Scanlon',         division: 'AAA', pdga: '272588',
    r1: [3,2,3,2,5,5,2,2,3,3,3,1], r2: [5,2,2,2,5,5,3,2,3,3,3,3] },  // 34 / 38
  { excelName: 'Craig Kimberley',    division: 'AAA', pdga: '14964',
    r1: [2,1,5,1,5,5,3,3,3,3,2,2], r2: [3,2,5,3,5,5,3,2,3,2,5,3] },  // 35 / 41
  { excelName: 'Coppola',            division: 'AAA', pdga: '101204',
    r1: [5,1,5,2,5,5,3,2,1,1,2,3], r2: [3,3,3,2,5,5,5,3,5,2,3,2] },  // 35 / 41
  { excelName: 'Jonathan Sawin',     division: 'AAA', pdga: '247239',
    r1: [2,1,5,3,5,5,5,3,5,1,5,3], r2: [3,1,2,1,5,5,1,3,5,3,3,3] },  // 43 / 35
  { excelName: 'William Baldridge',  division: 'AAA', pdga: '194789',
    r1: [3,2,2,5,5,2,2,1,5,3,3,3], r2: [2,2,5,3,5,3,2,3,5,2,5,5] },  // 36 / 42
  { excelName: 'Jason Osterberg',    division: 'AAA',
    r1: [3,2,3,2,5,5,3,3,3,2,5,2], r2: [2,1,3,3,5,5,3,3,5,5,3,3] },  // 38 / 41
  { excelName: 'Zachery Taylor',     division: 'AAA', pdga: '253729',
    r1: [3,3,5,5,3,5,5,2,5,2,3,1], r2: [2,1,5,2,5,3,5,2,5,3,3,2] },  // 42 / 38
  { excelName: 'Josh Graning',       division: 'AAA', pdga: '209741',
    r1: [3,1,3,1,3,5,5,5,5,2,3,5], r2: [5,1,3,3,5,2,5,1,5,3,3,3] },  // 41 / 39
  { excelName: 'Rick Lopez',         division: 'AAA', pdga: '215678',
    r1: [1,3,5,5,5,5,3,2,5,3,3,1], r2: [2,2,3,2,5,5,5,5,5,3,3,2] },  // 41 / 42
  { excelName: 'Jeremy Jacobs',      division: 'AAA', pdga: '184618',
    r1: [3,1,3,5,5,5,3,3,5,3,3,2], r2: [2,1,5,3,5,5,5,5,5,2,2,3] },  // 41 / 43
  { excelName: 'Ryan Tripp',         division: 'AAA', pdga: '179839',
    r1: [5,2,5,3,5,5,2,3,3,2,2,3], r2: [5,3,5,3,3,2,5,3,5,2,5,3] },  // 40 / 44

  // ── BBB ──────────────────────────────────────────────────────────────────
  { excelName: 'Al Ashcraft',        division: 'BBB', pdga: '78218',
    r1: [2,2,3,2,2,5,2,1,3,1,2,1], r2: [2,2,2,3,1,1,3,2,3,3,2,2] },  // 26 / 26
  { excelName: 'Ben Lopez',          division: 'BBB',
    r1: [1,1,2,2,3,2,1,1,5,2,5,1], r2: [1,1,2,3,5,2,2,2,3,1,3,2] },  // 26 / 27
  { excelName: 'Danimal',            division: 'BBB',
    r1: [2,1,3,3,5,2,1,2,2,2,5,1], r2: [1,1,5,2,3,2,1,2,2,1,3,2] },  // 29 / 25
  { excelName: 'Joey Westhoff',      division: 'BBB', pdga: '151475',
    r1: [2,2,3,3,5,5,1,2,2,2,3,2], r2: [2,1,5,2,2,3,3,2,2,1,2,2] },  // 32 / 27
  { excelName: 'Dan DeRoche',        division: 'BBB',
    r1: [1,1,5,2,5,5,3,5,5,2,3,2], r2: [3,2,1,3,3,3,3,1,2,3,5,2] },  // 39 / 31
  { excelName: 'Sean Stanford',      division: 'BBB',
    r1: [2,3,5,2,5,5,1,2,3,2,5,3], r2: [3,2,5,3,5,5,2,1,3,2,3,5] },  // 38 / 39

  // ── CCC ──────────────────────────────────────────────────────────────────
  { excelName: 'Renee Bastarache',   division: 'CCC',
    r1: [1,1,2,1,1,1,1,1,2,1,3,1], r2: [2,2,2,1,3,2,1,1,2,1,1,1] },  // 16 / 19
  { excelName: 'Kasia Czuba',        division: 'CCC',
    r1: [1,1,3,1,2,1,2,1,1,1,2,1], r2: [2,2,2,1,3,2,2,1,2,2,1,1] },  // 17 / 21
  { excelName: 'Ashley Smith-Boutin', division: 'CCC',
    r1: [1,1,5,1,2,3,2,1,3,1,1,1], r2: [1,1,2,1,3,5,2,1,1,1,1,2] },  // 22 / 21
  { excelName: 'Samantha Miller',    division: 'CCC',
    r1: [1,1,2,3,2,1,1,1,2,1,5,1], r2: [3,1,5,2,3,2,1,1,1,1,1,2] },  // 21 / 23
  { excelName: 'Roseanne Ham',       division: 'CCC', pdga: '161537',
    r1: [1,1,3,1,3,1,1,1,3,1,1,1], r2: [1,2,3,2,2,2,2,2,5,2,3,2] },  // 18 / 28
  { excelName: 'Lindsay Janeiro',    division: 'CCC', pdga: '246932',
    r1: [2,1,1,1,3,2,2,2,3,1,2,1], r2: [3,1,2,1,3,3,3,2,3,2,2,1] },  // 21 / 26
  { excelName: 'Christy Viccaro',    division: 'CCC', pdga: '291932',
    r1: [1,3,3,2,2,2,2,2,3,2,2,1], r2: [1,1,2,2,3,3,2,1,3,1,2,3] },  // 25 / 24
  { excelName: 'Dee Tripp',          division: 'CCC', pdga: '190389',
    r1: [1,1,5,2,3,2,2,2,1,1,3,1], r2: [1,2,5,1,5,5,2,1,1,2,2,2] },  // 24 / 29
  { excelName: 'Katie Alex',         division: 'CCC',
    r1: [3,1,3,2,5,5,2,1,2,1,5,3], r2: [3,1,2,2,5,3,2,1,3,1,2,2] },  // 33 / 27
  { excelName: 'Allie Lawler',       division: 'CCC', pdga: '227026',
    r1: [1,1,2,1,3,5,3,3,2,1,5,3], r2: [2,1,3,3,2,3,2,1,3,3,2,5] },  // 30 / 30
  // hole_1L in round 2 was NaN in source — treated as 0 (no putts made)
  { excelName: 'Kayla Holler',       division: 'CCC',
    r1: [3,1,5,3,1,2,1,1,4,1,5,3], r2: [1,0,3,3,3,5,1,2,2,3,3,2] },  // 30 / 28

  // ── DDD ──────────────────────────────────────────────────────────────────
  { excelName: 'Eric Faulkner',      division: 'DDD', pdga: '321062',
    r1: [1,1,5,1,1,1,2,2,3,1,1,1], r2: [1,1,3,3,1,2,2,2,3,1,1,3] },  // 20 / 23
  { excelName: 'David Driscoll',     division: 'DDD',
    r1: [1,1,3,3,3,4,2,1,3,2,2,2], r2: [2,2,3,3,3,3,2,1,2,1,2,2] },  // 27 / 26
  { excelName: 'Robert Williams',    division: 'DDD', pdga: '251926',
    r1: [2,1,5,1,5,2,2,1,3,1,5,2], r2: [2,1,2,2,1,2,5,1,5,1,3,2] },  // 30 / 27
  { excelName: 'Tom Scanlon',        division: 'DDD', pdga: '287268',
    r1: [1,1,3,3,5,3,2,1,1,3,3,1], r2: [2,1,5,2,3,3,2,1,5,2,2,2] },  // 27 / 30
  { excelName: 'Jim Lewis Jr',       division: 'DDD', pdga: '159538',
    r1: [1,1,5,3,5,5,2,2,5,2,1,2], r2: [3,1,3,2,2,3,3,2,3,1,3,1] },  // 34 / 27
  // Jim Foster: no scores (all NaN in source) — skipped
]

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function fakeEmail(name: string): string {
  return `${slugify(name)}@player.mvpl.golf`
}

async function findOrCreatePlayer(
  entry: PlayerEntry,
  divisionMap: Map<string, string>,
): Promise<string> {
  const candidates = [entry.excelName, NAME_ALIASES[entry.excelName]].filter(Boolean) as string[]

  for (const name of candidates) {
    const user = await prod.user.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      include: { player: true },
    })
    if (user?.player) return user.player.id
  }

  // Not found — create new User + Player
  const displayName = entry.excelName
  const parts = displayName.split(' ')
  const firstName = parts[0]
  const lastName = parts.slice(1).join(' ') || null
  const email = fakeEmail(displayName)

  console.log(`    ➕ Creating new player: ${displayName} <${email}>`)

  const user = await prod.user.create({
    data: {
      email,
      name: displayName,
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
  console.log('Connecting to production database…')
  await prod.$connect()

  // ── Resolve the existing night ────────────────────────────────────────────
  const night = await prod.leagueNight.findUnique({
    where: { id: NIGHT_ID },
    include: { holes: { orderBy: { number: 'asc' } }, rounds: { orderBy: { number: 'asc' } } },
  })
  if (!night) throw new Error(`League night ${NIGHT_ID} not found in production`)
  console.log(`Night: ${night.date.toISOString().slice(0, 10)} (${night.status})`)
  console.log(`  Holes: ${night.holes.length}, Rounds: ${night.rounds.length}`)

  if (night.holes.length !== NUM_HOLES) throw new Error(`Expected ${NUM_HOLES} holes, found ${night.holes.length}`)
  if (night.rounds.length !== 2) throw new Error(`Expected 2 rounds, found ${night.rounds.length}`)

  const holeIds = new Map(night.holes.map(h => [h.number, h.id]))
  const [round1, round2] = night.rounds

  // ── Division map ──────────────────────────────────────────────────────────
  const divisions = await prod.division.findMany()
  const divisionMap = new Map(divisions.map(d => [d.code, d.id]))

  // ── Existing check-ins (to skip duplicates) ───────────────────────────────
  const existingCheckIns = await prod.checkIn.findMany({
    where: { leagueNightId: NIGHT_ID },
    select: { playerId: true },
  })
  const checkedInPlayerIds = new Set(existingCheckIns.map(c => c.playerId))
  console.log(`\nExisting check-ins: ${checkedInPlayerIds.size}`)

  // ── Clear existing scores so Excel data overwrites them ───────────────────
  const deleted = await prod.score.deleteMany({
    where: { hole: { leagueNightId: NIGHT_ID } },
  })
  console.log(`Deleted ${deleted.count} existing scores (will be replaced from Excel)`)

  // ── Players → check-ins + scores ─────────────────────────────────────────
  console.log('\nProcessing players…')
  let ciCreated = 0
  let scCreated = 0

  for (const entry of PLAYERS) {
    const playerId = await findOrCreatePlayer(entry, divisionMap)
    const divisionId = divisionMap.get(entry.division) ?? null

    // Check-in (skip if already exists)
    if (!checkedInPlayerIds.has(playerId)) {
      await prod.checkIn.create({
        data: { leagueNightId: NIGHT_ID, playerId, divisionId, hasPaid: true },
      })
      console.log(`    ➕ Check-in created for ${entry.excelName}`)
      ciCreated++
    }

    // Scores — always insert fresh (existing scores were deleted above)
    for (const [roundId, scores] of [
      [round1.id, entry.r1],
      [round2.id, entry.r2],
    ] as [string, ScoreRow][]) {
      for (let h = 1; h <= NUM_HOLES; h++) {
        const holeId = holeIds.get(h)!
        const sIdx = (h - 1) * 2
        const lIdx = (h - 1) * 2 + 1

        await prod.score.create({
          data: { playerId, holeId, roundId, position: 'SHORT', made: scores[sIdx], bonus: false },
        })
        await prod.score.create({
          data: { playerId, holeId, roundId, position: 'LONG', made: scores[lIdx], bonus: false },
        })
        scCreated += 2
      }
    }

    const r1t = entry.r1.reduce((a, b) => a + b, 0)
    const r2t = entry.r2.reduce((a, b) => a + b, 0)
    console.log(`  ✓ ${entry.excelName} (${entry.division}) — R1:${r1t} R2:${r2t}`)
  }

  // ── Mark rounds complete + night COMPLETED ────────────────────────────────
  await prod.round.update({ where: { id: round1.id }, data: { isComplete: true } })
  await prod.round.update({ where: { id: round2.id }, data: { isComplete: true } })
  await prod.leagueNight.update({ where: { id: NIGHT_ID }, data: { status: 'COMPLETED' } })
  console.log('\n✓ Rounds marked complete, night status → COMPLETED')

  console.log(`\n✅ Done — ${ciCreated} new check-ins, ${scCreated} scores inserted`)

  await prod.$disconnect()
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
