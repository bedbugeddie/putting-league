/**
 * migrate-history-to-prod.ts
 *
 * Migrates historical league nights (Nov 2025 – Feb 2026) from the dev
 * database to the production database.
 *
 * Usage:
 *   PROD_DB_URL="postgresql://league:<password>@100.125.180.93:5432/league_db" \
 *     npx tsx backend/scripts/migrate-history-to-prod.ts
 *
 * Safe to run multiple times — skips nights that already exist in prod.
 */

import { PrismaClient } from '@prisma/client'

const DEV_DB_URL  = process.env.DATABASE_URL!
const PROD_DB_URL = process.env.PROD_DB_URL!

if (!PROD_DB_URL) {
  console.error('Error: PROD_DB_URL env var is required')
  process.exit(1)
}

const dev  = new PrismaClient({ datasources: { db: { url: DEV_DB_URL  } } })
const prod = new PrismaClient({ datasources: { db: { url: PROD_DB_URL } } })

// ── Player name aliases: dev name → prod name ──────────────────────────────
const NAME_ALIASES: Record<string, string> = {
  'Michael Sullivan':      'Mike Sullivan',
  'William Baldridge':     'Bill Baldridge',
  'Jessica Martin':        'Jess Martin',
  'Joey Westhoff':         'Joseph Westhoff',
  'Jose Portillo':         'Joe Portillo',
  'Jim Lewis Jr':          'Jim Lewis',
  'Robert Kemp Jr':        'Robert Kemp',
  'Craig Kimberley':       'Craig Kimberly',
  'Troy Yacyshyn':         'Troy Vacyshyn',
  'Reuben Hagen':          'Reuben Hagan',
  'Ricardo Gabriel Lopez': 'Rick Lopez',
  'Jeff Dags':             'Jeff D\uFFFDAgostino',
}

function normalizeName(name: string): string {
  return (NAME_ALIASES[name] ?? name).toLowerCase().trim()
}

async function buildPlayerMap(): Promise<Map<string, string>> {
  const devPlayers  = await dev.player.findMany({ include: { user: true } })
  const prodPlayers = await prod.player.findMany({ include: { user: true } })

  // Build prod lookup: normalized name → player id
  // For duplicate names in prod, use the one that appears first (lowest cuid = earliest created)
  const prodByName = new Map<string, string>()
  const sorted = [...prodPlayers].sort((a, b) => a.id.localeCompare(b.id))
  for (const p of sorted) {
    const key = p.user.name.toLowerCase().trim()
    if (!prodByName.has(key)) prodByName.set(key, p.id)
  }

  const map = new Map<string, string>() // dev player id → prod player id
  const unmapped: string[] = []

  for (const dp of devPlayers) {
    const key = normalizeName(dp.user.name)
    const prodId = prodByName.get(key)
    if (prodId) {
      map.set(dp.id, prodId)
    } else {
      unmapped.push(dp.user.name)
    }
  }

  if (unmapped.length) {
    console.warn('\n⚠️  Could not map these dev players to prod:', unmapped)
    console.warn('   Their check-ins and scores will be skipped.\n')
  }

  return map
}

async function main() {
  console.log('Connecting to databases…')
  await dev.$connect()
  await prod.$connect()

  // ── Prod season ─────────────────────────────────────────────────────────
  const prodSeason = await prod.season.findFirst({ orderBy: { startDate: 'asc' } })
  if (!prodSeason) throw new Error('No season found in production database')
  console.log(`Prod season: ${prodSeason.name} (${prodSeason.id})`)

  // ── Player mapping ───────────────────────────────────────────────────────
  console.log('\nBuilding player map…')
  const playerMap = await buildPlayerMap()
  console.log(`Mapped ${playerMap.size} dev players → prod player IDs`)

  // ── Nights to migrate: COMPLETED + CANCELLED before Mar 3 ───────────────
  const devNights = await dev.leagueNight.findMany({
    where: {
      status: { in: ['COMPLETED', 'CANCELLED'] },
      date: { lt: new Date('2026-03-03') },
    },
    orderBy: { date: 'asc' },
  })
  console.log(`\nFound ${devNights.length} historical nights to migrate`)

  // ── Check which nights already exist in prod ─────────────────────────────
  const existingProdNightIds = new Set(
    (await prod.leagueNight.findMany({ select: { id: true } })).map(n => n.id)
  )

  let created = 0, skipped = 0

  for (const night of devNights) {
    if (existingProdNightIds.has(night.id)) {
      console.log(`  ⏭  Skipping ${night.date.toISOString().slice(0, 10)} — already in prod`)
      skipped++
      continue
    }

    console.log(`\n  → Migrating ${night.date.toISOString().slice(0, 10)} (${night.status})…`)

    // Create league night in prod (reuse dev ID — CUIDs are globally unique)
    await prod.leagueNight.create({
      data: {
        id:        night.id,
        seasonId:  prodSeason.id,
        date:      night.date,
        status:    night.status,
        createdAt: night.createdAt,
        updatedAt: night.updatedAt,
      },
    })

    if (night.status === 'CANCELLED') {
      console.log('    (cancelled — no scores to migrate)')
      created++
      continue
    }

    // ── Rounds ─────────────────────────────────────────────────────────────
    const devRounds = await dev.round.findMany({
      where: { leagueNightId: night.id },
      orderBy: { number: 'asc' },
    })
    for (const r of devRounds) {
      await prod.round.create({
        data: {
          id:            r.id,
          leagueNightId: night.id,
          number:        r.number,
          isComplete:    r.isComplete,
          createdAt:     r.createdAt,
          updatedAt:     r.updatedAt,
        },
      })
    }
    console.log(`    ✓ ${devRounds.length} rounds`)

    // ── Holes ──────────────────────────────────────────────────────────────
    const devHoles = await dev.hole.findMany({
      where: { leagueNightId: night.id },
      orderBy: { number: 'asc' },
    })
    for (const h of devHoles) {
      await prod.hole.create({
        data: {
          id:            h.id,
          leagueNightId: night.id,
          number:        h.number,
          createdAt:     h.createdAt,
          updatedAt:     h.updatedAt,
        },
      })
    }
    console.log(`    ✓ ${devHoles.length} holes`)

    // ── Check-ins ──────────────────────────────────────────────────────────
    const devCheckIns = await dev.checkIn.findMany({
      where: { leagueNightId: night.id },
    })
    let ciCreated = 0, ciSkipped = 0
    for (const ci of devCheckIns) {
      const prodPlayerId = playerMap.get(ci.playerId)
      if (!prodPlayerId) { ciSkipped++; continue }
      await prod.checkIn.create({
        data: {
          id:            ci.id,
          leagueNightId: night.id,
          playerId:      prodPlayerId,
          checkedInAt:   ci.checkedInAt,
          checkedInBy:   ci.checkedInBy,
          hasPaid:       ci.hasPaid,
        },
      }).catch(() => { ciSkipped++ }) // skip on unique constraint violation
      ciCreated++
    }
    console.log(`    ✓ ${ciCreated} check-ins${ciSkipped ? ` (${ciSkipped} skipped)` : ''}`)

    // ── Scores ─────────────────────────────────────────────────────────────
    const devScores = await dev.score.findMany({
      where: { hole: { leagueNightId: night.id } },
    })
    let scCreated = 0, scSkipped = 0
    for (const sc of devScores) {
      const prodPlayerId = playerMap.get(sc.playerId)
      if (!prodPlayerId) { scSkipped++; continue }
      await prod.score.create({
        data: {
          id:        sc.id,
          playerId:  prodPlayerId,
          holeId:    sc.holeId,
          roundId:   sc.roundId,
          position:  sc.position,
          made:      sc.made,
          bonus:     sc.bonus,
          enteredBy: sc.enteredBy,
          createdAt: sc.createdAt,
          updatedAt: sc.updatedAt,
        },
      }).catch(() => { scSkipped++ })
      scCreated++
    }
    console.log(`    ✓ ${scCreated} scores${scSkipped ? ` (${scSkipped} skipped)` : ''}`)

    created++
  }

  console.log(`\n✅ Done — ${created} nights migrated, ${skipped} already existed`)

  await dev.$disconnect()
  await prod.$disconnect()
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
