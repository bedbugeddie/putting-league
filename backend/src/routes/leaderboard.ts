import { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma.js'
import { calcLeagueNightTotals } from '../services/scoring.js'
import { getSeasonLeaderboard } from '../services/stats.js'

export async function leaderboardRoutes(app: FastifyInstance) {
  // GET live leaderboard for a league night (overall + per division)
  app.get('/league-nights/:id/leaderboard', async (req, reply) => {
    const { id } = req.params as { id: string }

    const totals = await calcLeagueNightTotals(id)

    // Group by division
    const byDivision = new Map<string, typeof totals>()
    for (const t of totals) {
      if (!byDivision.has(t.divisionCode)) byDivision.set(t.divisionCode, [])
      byDivision.get(t.divisionCode)!.push(t)
    }

    return reply.send({
      overall: totals,
      byDivision: Object.fromEntries(byDivision.entries()),
    })
  })

  // GET season leaderboard
  app.get('/seasons/:id/leaderboard', async (req, reply) => {
    const { id } = req.params as { id: string }
    const leaderboard = await getSeasonLeaderboard(id)
    return reply.send({ leaderboard })
  })

  // GET hole-by-hole breakdown for a league night
  app.get('/league-nights/:id/hole-breakdown', async (req, reply) => {
    const { id } = req.params as { id: string }

    const scores = await prisma.score.findMany({
      where: { hole: { leagueNightId: id } },
      include: {
        player: { include: { user: true } },
        hole: true,
        round: true,
      },
    })

    // Group by hole number
    const byHole = new Map<number, { holeNumber: number; totalMade: number; totalBonus: number; attempts: number }>()

    for (const s of scores) {
      const n = s.hole.number
      if (!byHole.has(n)) byHole.set(n, { holeNumber: n, totalMade: 0, totalBonus: 0, attempts: 0 })
      const h = byHole.get(n)!
      h.totalMade += s.made
      if (s.bonus) h.totalBonus++
      h.attempts++
    }

    const holeBreakdown = Array.from(byHole.values())
      .map(h => ({
        ...h,
        accuracy: h.attempts > 0 ? (h.totalMade / (h.attempts * 3)) * 100 : 0,
      }))
      .sort((a, b) => a.holeNumber - b.holeNumber)

    return reply.send({ holeBreakdown })
  })
}
