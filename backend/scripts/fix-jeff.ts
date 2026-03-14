/**
 * fix-jeff.ts
 *
 * Inserts missing check-ins and scores for Jeff D'Agostino (prod) / Jeff Dags (dev)
 * across all historical nights that were already migrated to prod.
 *
 * Usage:
 *   PROD_DB_URL="postgresql://league:<password>@100.125.180.93:5432/league_db" \
 *     npx tsx backend/scripts/fix-jeff.ts
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

async function main() {
  await dev.$connect()
  await prod.$connect()

  // ── Find Jeff in dev ──────────────────────────────────────────────────────
  const devPlayers = await dev.player.findMany({ include: { user: true } })
  const devJeff = devPlayers.find(p => p.user.name.toLowerCase().includes('jeff'))
  if (!devJeff) throw new Error('Could not find Jeff in dev DB')
  console.log(`Dev Jeff: ${devJeff.user.name} (${devJeff.id})`)

  // ── Find Jeff in prod ─────────────────────────────────────────────────────
  const prodPlayers = await prod.player.findMany({ include: { user: true } })
  // His prod name has U+FFFD replacement character: "Jeff D\uFFFDAgostino"
  const prodJeff = prodPlayers.find(p => p.user.name.toLowerCase().includes('jeff'))
  if (!prodJeff) throw new Error('Could not find Jeff in prod DB')
  console.log(`Prod Jeff: ${prodJeff.user.name} (${prodJeff.id})`)

  // ── Get all historical nights in prod ──────────────────────────────────────
  const prodNights = await prod.leagueNight.findMany({
    where: { status: { in: ['COMPLETED', 'CANCELLED'] } },
    orderBy: { date: 'asc' },
  })
  console.log(`\nFound ${prodNights.length} nights in prod to process\n`)

  let ciAdded = 0, scAdded = 0, nightsProcessed = 0

  for (const night of prodNights) {
    if (night.status === 'CANCELLED') continue

    // ── Check-ins ────────────────────────────────────────────────────────────
    const devCheckIns = await dev.checkIn.findMany({
      where: { leagueNightId: night.id, playerId: devJeff.id },
    })

    for (const ci of devCheckIns) {
      try {
        await prod.checkIn.create({
          data: {
            id:            ci.id,
            leagueNightId: night.id,
            playerId:      prodJeff.id,
            checkedInAt:   ci.checkedInAt,
            checkedInBy:   ci.checkedInBy,
            hasPaid:       ci.hasPaid,
          },
        })
        ciAdded++
      } catch {
        // already exists — skip
      }
    }

    // ── Scores ───────────────────────────────────────────────────────────────
    const devScores = await dev.score.findMany({
      where: { hole: { leagueNightId: night.id }, playerId: devJeff.id },
    })

    let nightScores = 0
    for (const sc of devScores) {
      try {
        await prod.score.create({
          data: {
            id:        sc.id,
            playerId:  prodJeff.id,
            holeId:    sc.holeId,
            roundId:   sc.roundId,
            position:  sc.position,
            made:      sc.made,
            bonus:     sc.bonus,
            enteredBy: sc.enteredBy,
            createdAt: sc.createdAt,
            updatedAt: sc.updatedAt,
          },
        })
        scAdded++
        nightScores++
      } catch {
        // already exists — skip
      }
    }

    if (devCheckIns.length || devScores.length) {
      const dateStr = night.date.toISOString().slice(0, 10)
      console.log(`  ${dateStr}: ${devCheckIns.length} check-in(s), ${nightScores} scores`)
      nightsProcessed++
    }
  }

  console.log(`\n✅ Done — ${nightsProcessed} nights updated, ${ciAdded} check-ins added, ${scAdded} scores added`)

  await dev.$disconnect()
  await prod.$disconnect()
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
