import { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { getPlayerStats, getLeagueRecords } from '../services/stats.js'
import { requireAuth } from '../middleware/auth.js'

export async function statsRoutes(app: FastifyInstance) {
  // GET player stats (own stats – any auth'd user; admin can query any player)
  app.get('/players/:id/stats', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const requestingUser = req.user!

    // Players can only see their own stats unless admin
    const player = await prisma.player.findUnique({ where: { id }, include: { user: true } })
    if (!player) return reply.status(404).send({ error: 'Player not found' })

    if (!requestingUser.isAdmin && player.userId !== requestingUser.userId) {
      return reply.status(403).send({ error: 'Forbidden' })
    }

    const stats = await getPlayerStats(id)
    return reply.send({ stats })
  })

  // GET league records
  app.get('/stats/records', async (req, reply) => {
    const { seasonId } = req.query as { seasonId?: string }
    const records = await getLeagueRecords(seasonId)
    return reply.send({ records })
  })

  // GET per-night history for a player
  app.get('/players/:id/history', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }

    const scores = await prisma.score.findMany({
      where: { playerId: id },
      include: { hole: { include: { leagueNight: { include: { season: true } } } }, round: true },
      orderBy: { createdAt: 'asc' },
    })

    // Group by league night
    const byNight = new Map<string, {
      leagueNightId: string
      date: Date
      seasonName: string
      totalScore: number
      bonuses: number
    }>()

    for (const s of scores) {
      const nid = s.hole.leagueNightId
      if (!byNight.has(nid)) {
        byNight.set(nid, {
          leagueNightId: nid,
          date: s.hole.leagueNight.date,
          seasonName: s.hole.leagueNight.season.name,
          totalScore: 0,
          bonuses: 0,
        })
      }
      const entry = byNight.get(nid)!
      entry.totalScore += s.made + (s.bonus ? 1 : 0)
      if (s.bonus) entry.bonuses++
    }

    const history = Array.from(byNight.values()).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    )

    return reply.send({ history })
  })

  // GET division stats for a season
  app.get('/seasons/:id/division-stats', async (req, reply) => {
    const { id } = req.params as { id: string }

    const nights = await prisma.leagueNight.findMany({
      where: { seasonId: id, status: 'COMPLETED' },
      select: { id: true },
    })
    const nightIds = nights.map(n => n.id)

    if (!nightIds.length) return reply.send({ divisionStats: [] })

    const scores = await prisma.score.findMany({
      where: { hole: { leagueNightId: { in: nightIds } } },
      include: { player: { include: { division: true } } },
    })

    const divMap = new Map<string, { divisionCode: string; totalMade: number; totalBonus: number; playerCount: Set<string> }>()

    for (const s of scores) {
      const code = s.player.division.code
      if (!divMap.has(code)) divMap.set(code, { divisionCode: code, totalMade: 0, totalBonus: 0, playerCount: new Set() })
      const d = divMap.get(code)!
      d.totalMade += s.made
      if (s.bonus) d.totalBonus++
      d.playerCount.add(s.playerId)
    }

    const divisionStats = Array.from(divMap.values()).map(d => ({
      divisionCode: d.divisionCode,
      totalMade: d.totalMade,
      totalBonus: d.totalBonus,
      uniquePlayers: d.playerCount.size,
    }))

    return reply.send({ divisionStats })
  })

  // GET CSV export for a league night
  app.get('/admin/league-nights/:id/export/csv', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }

    const scores = await prisma.score.findMany({
      where: { hole: { leagueNightId: id } },
      include: {
        player: { include: { user: true, division: true } },
        hole: true,
        round: true,
      },
      orderBy: [
        { player: { user: { name: 'asc' } } },
        { round: { number: 'asc' } },
        { hole: { number: 'asc' } },
      ],
    })

    const rows = [
      ['Player', 'Division', 'Round', 'Hole', 'Position', 'Made', 'Bonus', 'Points'],
      ...scores.map(s => [
        s.player.user.name,
        s.player.division.code,
        s.round.number,
        s.hole.number,
        s.position,
        s.made,
        s.bonus ? '1' : '0',
        s.made + (s.bonus ? 1 : 0),
      ]),
    ]

    const csv = rows.map(r => r.join(',')).join('\n')

    reply.header('Content-Type', 'text/csv')
    reply.header('Content-Disposition', `attachment; filename="league-night-${id}.csv"`)
    return reply.send(csv)
  })
}
