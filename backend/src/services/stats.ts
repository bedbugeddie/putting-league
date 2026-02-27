import { prisma } from '../lib/prisma.js'

/** Season-wide leaderboard: aggregate scores across all league nights in a season */
export async function getSeasonLeaderboard(seasonId: string) {
  const nights = await prisma.leagueNight.findMany({
    where: { seasonId, status: 'COMPLETED' },
    select: { id: true },
  })
  const nightIds = nights.map(n => n.id)
  if (!nightIds.length) return []

  const scores = await prisma.score.findMany({
    where: { hole: { leagueNightId: { in: nightIds } } },
    include: {
      player: { include: { user: true, division: true } },
      hole: true,
    },
  })

  const playerMap = new Map<string, {
    playerId: string
    playerName: string
    divisionCode: string
    totalScore: number
    nightsPlayed: Set<string>
    bonuses: number
  }>()

  for (const s of scores) {
    const key = s.player.id
    if (!playerMap.has(key)) {
      playerMap.set(key, {
        playerId: key,
        playerName: s.player.user.name,
        divisionCode: s.player.division!.code,
        totalScore: 0,
        nightsPlayed: new Set(),
        bonuses: 0,
      })
    }
    const entry = playerMap.get(key)!
    entry.totalScore += s.made + (s.bonus ? 1 : 0)
    entry.nightsPlayed.add(s.hole.leagueNightId ?? '')
    if (s.bonus) entry.bonuses++
  }

  return Array.from(playerMap.values())
    .map(e => ({ ...e, nightsPlayed: e.nightsPlayed.size }))
    .sort((a, b) => b.totalScore - a.totalScore)
}

/** Per-player stats across their entire history */
export async function getPlayerStats(playerId: string) {
  const scores = await prisma.score.findMany({
    where: { playerId },
    include: { hole: { include: { leagueNight: true } }, round: true },
    orderBy: { createdAt: 'asc' },
  })

  if (!scores.length) return null

  const totalAttempts = scores.length
  const totalMade = scores.reduce((s, x) => s + x.made, 0)
  const totalBonus = scores.filter(s => s.bonus).length
  const totalScore = totalMade + totalBonus
  const shortScores = scores.filter(s => s.position === 'SHORT')
  const longScores = scores.filter(s => s.position === 'LONG')

  // Group scores by league night to find night-by-night totals
  const byNight = new Map<string, number>()
  for (const s of scores) {
    const nid = s.hole.leagueNightId
    byNight.set(nid, (byNight.get(nid) ?? 0) + s.made + (s.bonus ? 1 : 0))
  }

  const nightScores = Array.from(byNight.values())
  const highestNight = Math.max(...nightScores, 0)
  const avgPerNight = nightScores.length ? totalScore / nightScores.length : 0

  return {
    playerId,
    totalAttempts,
    totalMade,
    totalBonus,
    totalScore,
    highestNight,
    avgPerNight: Math.round(avgPerNight * 100) / 100,
    shortAccuracy: shortScores.length ? totalMade / (shortScores.length * 3) : 0,
    longAccuracy: longScores.length
      ? longScores.reduce((s, x) => s + x.made, 0) / (longScores.length * 3)
      : 0,
    nightsPlayed: byNight.size,
  }
}

/** League-wide records and fun stats */
export async function getLeagueRecords(seasonId?: string) {
  const nightFilter = seasonId
    ? { leagueNight: { seasonId } }
    : {}

  // Most 3-for-3 bonuses
  const topBonus = await prisma.score.groupBy({
    by: ['playerId'],
    where: { bonus: true, hole: nightFilter },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 5,
  })

  // Enrich bonus leaders with player names
  const bonusPlayerIds = topBonus.map(b => b.playerId)
  const bonusPlayers = await prisma.player.findMany({
    where: { id: { in: bonusPlayerIds } },
    include: { user: true },
  })
  const nameMap = new Map(bonusPlayers.map(p => [p.id, p.user.name]))
  const topBonusLeaders = topBonus.map(b => ({
    playerId: b.playerId,
    playerName: nameMap.get(b.playerId) ?? 'Unknown',
    count: b._count.id,
  }))

  // Highest single league night score – compute in memory
  const allScores = await prisma.score.findMany({
    where: { hole: nightFilter },
    select: { playerId: true, made: true, bonus: true, hole: { select: { leagueNightId: true } } },
  })

  const nightPlayerMap = new Map<string, number>()
  for (const s of allScores) {
    const key = `${s.playerId}::${s.hole.leagueNightId}`
    nightPlayerMap.set(key, (nightPlayerMap.get(key) ?? 0) + s.made + (s.bonus ? 1 : 0))
  }

  const highestSingleNight = Math.max(...nightPlayerMap.values(), 0)

  // Most improved: compare first half vs second half of nights played
  // (simplified – return raw data for the frontend to display)

  return {
    topBonusLeaders,
    highestSingleNight,
  }
}
