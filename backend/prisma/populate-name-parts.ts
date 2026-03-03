/**
 * Parses existing user `name` values into firstName / lastName / suffix fields.
 *
 * Run locally (dev DB):
 *   npx tsx prisma/populate-name-parts.ts
 *
 * Run against prod (from inside the backend Docker container):
 *   node -e "require('child_process').execSync('npx tsx prisma/populate-name-parts.ts', {stdio:'inherit'})"
 * or simply exec into the container and run the same tsx command.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const SUFFIXES = new Set(['jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', 'v', 'esq', 'esq.'])

function parseName(name: string): { firstName: string; lastName: string; suffix: string | null } {
  const tokens = name.trim().split(/\s+/).filter(Boolean)

  if (tokens.length === 0) return { firstName: '', lastName: '', suffix: null }
  if (tokens.length === 1) return { firstName: tokens[0], lastName: '', suffix: null }

  // Detect trailing suffix
  let suffix: string | null = null
  let remaining = [...tokens]

  if (SUFFIXES.has(tokens[tokens.length - 1].toLowerCase())) {
    suffix = tokens[tokens.length - 1]
    remaining = tokens.slice(0, -1)
  }

  if (remaining.length === 0) return { firstName: '', lastName: '', suffix }
  if (remaining.length === 1) return { firstName: remaining[0], lastName: '', suffix }

  // Last remaining token = lastName, everything before = firstName
  const lastName  = remaining[remaining.length - 1]
  const firstName = remaining.slice(0, -1).join(' ')

  return { firstName, lastName, suffix }
}

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, name: true, firstName: true, lastName: true } })

  console.log(`Found ${users.length} users`)

  let updated = 0
  let skipped = 0

  for (const user of users) {
    // Skip if already populated
    if (user.firstName) {
      skipped++
      continue
    }

    const { firstName, lastName, suffix } = parseName(user.name)

    await prisma.user.update({
      where: { id: user.id },
      data: { firstName, lastName, suffix },
    })

    console.log(`  ✓ "${user.name}" → "${firstName}" / "${lastName}"${suffix ? ` / "${suffix}"` : ''}`)
    updated++
  }

  console.log(`\nDone. Updated: ${updated}, Skipped (already set): ${skipped}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
