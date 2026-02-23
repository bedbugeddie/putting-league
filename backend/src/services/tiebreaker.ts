import { prisma } from '../lib/prisma.js'

/**
 * Create a putt-off between tied players.
 * Returns the PuttOff record.
 */
export async function createPuttOff(leagueNightId: string, divisionId: string, playerIds: string[]) {
  return prisma.puttOff.create({
    data: {
      leagueNightId,
      divisionId,
      round: 1,
      participants: {
        create: playerIds.map(playerId => ({ playerId, round: 1, made: 0 })),
      },
    },
    include: { participants: { include: { player: { include: { user: true } } } } },
  })
}

/**
 * Record putt-off scores and determine if there's a winner.
 * Returns { winnerId, stillTied } after processing.
 */
export async function recordPuttOffRound(
  puttOffId: string,
  scores: { playerId: string; made: number }[]
) {
  const puttOff = await prisma.puttOff.findUniqueOrThrow({
    where: { id: puttOffId },
    include: { participants: true },
  })

  const currentRound = puttOff.round

  // Update each participant's score for this round
  await Promise.all(
    scores.map(({ playerId, made }) => {
      const bonus = made === 3
      return prisma.puttOffParticipant.upsert({
        where: { puttOffId_playerId_round: { puttOffId, playerId, round: currentRound } },
        create: { puttOffId, playerId, round: currentRound, made, bonus },
        update: { made, bonus },
      })
    })
  )

  // Check if there's a clear winner
  const topScore = Math.max(...scores.map(s => s.made))
  const winners = scores.filter(s => s.made === topScore)

  if (winners.length === 1) {
    // We have a winner
    await prisma.puttOff.update({
      where: { id: puttOffId },
      data: { winnerId: winners[0].playerId },
    })
    return { winnerId: winners[0].playerId, stillTied: false }
  }

  // Still tied – advance to next round with only the tied players
  await prisma.puttOff.update({
    where: { id: puttOffId },
    data: {
      round: currentRound + 1,
      participants: {
        create: winners.map(w => ({
          playerId: w.playerId,
          round: currentRound + 1,
          made: 0,
        })),
      },
    },
  })

  return { winnerId: null, stillTied: true, tiedPlayerIds: winners.map(w => w.playerId) }
}
