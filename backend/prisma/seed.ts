import { PrismaClient, Role } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // ── Default Divisions ──────────────────────────────────────────────────────
  const divisions = await Promise.all([
    prisma.division.upsert({
      where: { code: 'AAA' },
      update: {},
      create: { code: 'AAA', name: 'A Pool – Advanced', sortOrder: 1 },
    }),
    prisma.division.upsert({
      where: { code: 'BBB' },
      update: {},
      create: { code: 'BBB', name: 'B Pool – Beginner Men\'s', sortOrder: 2 },
    }),
    prisma.division.upsert({
      where: { code: 'CCC' },
      update: {},
      create: { code: 'CCC', name: 'C Pool – Women\'s All Levels', sortOrder: 3 },
    }),
    prisma.division.upsert({
      where: { code: 'DDD' },
      update: {},
      create: { code: 'DDD', name: 'D Pool – Men\'s 55+', sortOrder: 4 },
    }),
  ])

  console.log(`✅ Created ${divisions.length} divisions`)

  // ── Admin User ─────────────────────────────────────────────────────────────
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@league.local' },
    update: {},
    create: {
      email: 'admin@league.local',
      name: 'League Admin',
      role: Role.ADMIN,
    },
  })

  console.log(`✅ Admin user: ${adminUser.email}`)

  // ── Default Season ─────────────────────────────────────────────────────────
  const existingSeason = await prisma.season.findFirst({ where: { name: '2025 Season' } })
  if (!existingSeason) {
    await prisma.season.create({
      data: { name: '2025 Season', startDate: new Date('2025-01-01'), isActive: true },
    })
  }

  console.log('✅ Default season created')
  console.log('🎯 Seeding complete!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
