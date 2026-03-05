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
    shortAccuracy: shortScores.length ? shortScores.reduce((s, x) => s + x.made, 0) / (shortScores.length * 3) : 0,
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
    take: 20,
  })

  // Enrich bonus leaders with player names and division
  const bonusPlayerIds = topBonus.map(b => b.playerId)
  const bonusPlayers = await prisma.player.findMany({
    where: { id: { in: bonusPlayerIds } },
    include: { user: true, division: true },
  })
  const playerInfoMap = new Map(bonusPlayers.map(p => [p.id, {
    name: p.user.name,
    divisionCode: p.division?.code ?? '',
    divisionName: p.division?.name ?? '',
  }]))
  const topBonusLeaders = topBonus.map(b => ({
    playerId: b.playerId,
    playerName: playerInfoMap.get(b.playerId)?.name ?? 'Unknown',
    divisionCode: playerInfoMap.get(b.playerId)?.divisionCode ?? '',
    count: b._count.id,
  }))

  // All scores with player + night date for highest-score and top-scores computations
  const allScores = await prisma.score.findMany({
    where: { hole: nightFilter },
    select: {
      playerId: true,
      made: true,
      bonus: true,
      hole: {
        select: {
          leagueNightId: true,
          leagueNight: { select: { date: true } },
        },
      },
      player: {
        select: {
          user: { select: { name: true } },
          division: { select: { code: true, name: true } },
        },
      },
    },
  })

  // Build per-player-per-night totals
  const nightPlayerMap = new Map<string, {
    score: number; playerId: string; playerName: string
    divisionCode: string; date: Date
  }>()

  for (const s of allScores) {
    const key = `${s.playerId}::${s.hole.leagueNightId}`
    const pts = s.made + (s.bonus ? 1 : 0)
    if (!nightPlayerMap.has(key)) {
      nightPlayerMap.set(key, {
        score: 0,
        playerId: s.playerId,
        playerName: s.player.user.name,
        divisionCode: s.player.division?.code ?? '',
        date: s.hole.leagueNight.date,
      })
    }
    nightPlayerMap.get(key)!.score += pts
  }

  const sortedNightScores = [...nightPlayerMap.values()].sort((a, b) => b.score - a.score)
  const highestSingleNight = sortedNightScores[0]?.score ?? 0

  // Highest single-night score per division — first occurrence in sorted list = max for that division
  const highestByDivisionMap = new Map<string, number>()
  for (const e of sortedNightScores) {
    if (e.divisionCode && !highestByDivisionMap.has(e.divisionCode)) {
      highestByDivisionMap.set(e.divisionCode, e.score)
    }
  }
  const highestByDivision = [...highestByDivisionMap.entries()].map(([divisionCode, score]) => ({
    divisionCode,
    score,
  }))

  // Top 5 overall (for "All Divisions" view)
  const topNightScores = sortedNightScores.slice(0, 5).map(e => ({
    playerId: e.playerId,
    playerName: e.playerName,
    divisionCode: e.divisionCode,
    score: e.score,
    date: e.date.toISOString(),
  }))

  // Top 5 per division (for division-filtered view) — walk sorted list, stop at 5 per div
  const topNightScoresByDivision: Record<string, {
    playerId: string; playerName: string; divisionCode: string; score: number; date: string
  }[]> = {}
  const perDivCount = new Map<string, number>()
  for (const e of sortedNightScores) {
    if (!e.divisionCode) continue
    const count = perDivCount.get(e.divisionCode) ?? 0
    if (count < 5) {
      if (!topNightScoresByDivision[e.divisionCode]) topNightScoresByDivision[e.divisionCode] = []
      topNightScoresByDivision[e.divisionCode].push({
        playerId: e.playerId,
        playerName: e.playerName,
        divisionCode: e.divisionCode,
        score: e.score,
        date: e.date.toISOString(),
      })
      perDivCount.set(e.divisionCode, count + 1)
    }
  }

  return {
    topBonusLeaders,
    highestSingleNight,
    highestByDivision,
    topNightScores,
    topNightScoresByDivision,
  }
}
