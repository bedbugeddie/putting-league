import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../store/auth'
import type { PlayerStats, LeagueNight, Card, Score, Position } from '../api/types'
import Spinner from '../components/ui/Spinner'
import { format } from 'date-fns'

type ScoreKey = `${string}::${string}::${string}::${Position}`

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="card text-center">
      <p className="text-3xl font-bold text-brand-700">{value}</p>
      <p className="text-sm font-medium text-gray-700 mt-1">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Live scorecard ────────────────────────────────────────────────────────────

function LiveScorecard({ night, myCard, scores, myPlayerId }: {
  night: LeagueNight
  myCard: Card
  scores: Score[]
  myPlayerId: string
}) {
  // Build a map: key → made value (only for scores that actually exist)
  const scoreMap = new Map<ScoreKey, number>()
  for (const s of scores) {
    if (s.hole && s.round) {
      const key = `${s.playerId}::${s.hole.id}::${s.round.id}::${s.position}` as ScoreKey
      scoreMap.set(key, s.made)
    }
  }

  function getMade(playerId: string, holeId: string, roundId: string, pos: Position): number | null {
    const key = `${playerId}::${holeId}::${roundId}::${pos}` as ScoreKey
    return scoreMap.has(key) ? scoreMap.get(key)! : null
  }

  const players = myCard.players.map(cp => cp.player)
  const holes = [...(night.holes ?? [])].sort((a, b) => a.number - b.number)
  const rounds = [...(night.rounds ?? [])].sort((a, b) => a.number - b.number)

  return (
    <div className="card space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">
            Live Scorecard — {myCard.name}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {format(new Date(night.date), 'EEEE, MMMM d, yyyy')} · Starts at Hole #{myCard.startingHole}
          </p>
        </div>
        <Link
          to={`/league-nights/${night.id}/leaderboard`}
          className="btn-secondary text-xs py-1.5 px-3"
        >
          View Leaderboard →
        </Link>
      </div>

      {/* One table per round */}
      {rounds.map(round => {
        const rows = players.map(player => {
          let total = 0
          let bonuses = 0
          const holeScores = holes.map(hole => {
            const s = getMade(player.id, hole.id, round.id, 'SHORT')
            const l = getMade(player.id, hole.id, round.id, 'LONG')
            if (s === 3) bonuses++
            if (l === 3) bonuses++
            total += (s ?? 0) + (l ?? 0)
            return { short: s, long: l }
          })
          return { player, total: total + bonuses, bonuses, holeScores }
        })

        return (
          <div key={round.id}>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
              Round {round.number}{round.isComplete ? ' · Complete ✓' : ' · In progress'}
            </p>
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-forest-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700/50">
                    <th className="text-left px-3 py-2 font-medium text-gray-500 text-xs" rowSpan={2}>
                      Player
                    </th>
                    {holes.map(h => (
                      <th
                        key={h.id}
                        colSpan={2}
                        className="px-1 py-1.5 font-medium text-gray-500 text-center border-l border-gray-200 dark:border-gray-600 text-xs"
                      >
                        H{h.number}
                      </th>
                    ))}
                    <th className="px-3 py-1.5 font-medium text-gray-500 text-right text-xs" rowSpan={2}>
                      Total
                    </th>
                  </tr>
                  <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                    {holes.map(h => (
                      <>
                        <th
                          key={`${h.id}-s`}
                          className="px-1 pb-1.5 text-[10px] font-medium text-gray-400 text-center border-l border-gray-200 dark:border-gray-600"
                        >
                          S
                        </th>
                        <th
                          key={`${h.id}-l`}
                          className="px-1 pb-1.5 text-[10px] font-medium text-gray-400 text-center"
                        >
                          L
                        </th>
                      </>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ player, total, bonuses, holeScores }) => {
                    const isMe = player.id === myPlayerId
                    return (
                      <tr
                        key={player.id}
                        className={`border-b border-gray-100 dark:border-gray-700 last:border-0 ${
                          isMe ? 'bg-brand-50 dark:bg-brand-900/20' : ''
                        }`}
                      >
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className={`font-medium text-xs ${isMe ? 'text-brand-800 dark:text-brand-200' : ''}`}>
                            {player.user.name}
                            {isMe && <span className="ml-1 opacity-60">← you</span>}
                          </span>
                        </td>
                        {holeScores.map((hs, i) => (
                          <>
                            <td
                              key={`${i}-s`}
                              className={`px-1 py-2.5 text-center font-semibold border-l border-gray-100 dark:border-gray-700 text-xs ${
                                hs.short === 3
                                  ? 'text-yellow-600'
                                  : hs.short === null
                                  ? 'text-gray-300 dark:text-gray-600'
                                  : 'text-gray-700 dark:text-gray-300'
                              }`}
                            >
                              {hs.short === null ? '—' : hs.short}
                            </td>
                            <td
                              key={`${i}-l`}
                              className={`px-1 py-2.5 text-center font-semibold text-xs ${
                                hs.long === 3
                                  ? 'text-yellow-600'
                                  : hs.long === null
                                  ? 'text-gray-300 dark:text-gray-600'
                                  : 'text-gray-700 dark:text-gray-300'
                              }`}
                            >
                              {hs.long === null ? '—' : hs.long}
                            </td>
                          </>
                        ))}
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          <span className={`text-base font-bold ${isMe ? 'text-brand-700' : 'text-gray-800 dark:text-gray-200'}`}>
                            {total}
                          </span>
                          {bonuses > 0 && (
                            <span className="block text-[10px] text-yellow-600 font-medium">+{bonuses} ★</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PlayerDashboardPage() {
  const { user } = useAuth()
  const playerId = user?.player?.id

  // Stats
  const { data: statsData, isLoading: statsLoading } = useQuery<{ stats: PlayerStats | null }>({
    queryKey: ['player-stats', playerId],
    queryFn: () => api.get(`/players/${playerId}/stats`),
    enabled: !!playerId,
  })

  // Active league night (list, filtered to IN_PROGRESS client-side)
  const { data: nightsData } = useQuery<{ leagueNights: LeagueNight[] }>({
    queryKey: ['league-nights'],
    queryFn: () => api.get('/league-nights'),
    enabled: !!playerId,
    refetchInterval: 30_000,
  })
  const activeNight = (nightsData?.leagueNights ?? []).find(n => n.status === 'IN_PROGRESS')
  const activeNightId = activeNight?.id

  // Night detail (holes + rounds)
  const { data: nightDetailData } = useQuery<{ leagueNight: LeagueNight }>({
    queryKey: ['league-night', activeNightId],
    queryFn: () => api.get(`/league-nights/${activeNightId}`),
    enabled: !!activeNightId,
    refetchInterval: 15_000,
  })

  // Cards (to find which card the player is on)
  const { data: cardsData } = useQuery<{ cards: Card[] }>({
    queryKey: ['cards', activeNightId],
    queryFn: () => api.get(`/league-nights/${activeNightId}/cards`),
    enabled: !!activeNightId,
    refetchInterval: 15_000,
  })

  // All scores for the active night
  const { data: scoresData } = useQuery<{ scores: Score[] }>({
    queryKey: ['scores', activeNightId],
    queryFn: () => api.get(`/league-nights/${activeNightId}/scores`),
    enabled: !!activeNightId,
    refetchInterval: 15_000,
  })

  if (!playerId) {
    return (
      <div className="card text-center py-10">
        <p className="text-gray-500">No player profile found. Contact an admin.</p>
      </div>
    )
  }

  if (statsLoading) {
    return <div className="flex justify-center py-20"><Spinner className="h-10 w-10" /></div>
  }

  const stats = statsData?.stats
  const night = nightDetailData?.leagueNight
  const cards = cardsData?.cards ?? []
  const scores = scoresData?.scores ?? []
  const myCard = cards.find(c => c.players.some(cp => cp.playerId === playerId)) ?? null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">My Dashboard</h1>
          <p className="text-gray-500 mt-1">
            Welcome, <strong>{user?.name}</strong>
            {user?.player?.division?.code ? ` · Division: ${user.player.division.code}` : ''}
          </p>
        </div>
        <Link to="/profile" className="btn-secondary text-sm">My Profile</Link>
      </div>

      {/* Live scorecard (only when there's an active night and the player is on a card) */}
      {night && myCard && (
        <LiveScorecard
          night={night}
          myCard={myCard}
          scores={scores}
          myPlayerId={playerId}
        />
      )}

      {/* Career stats */}
      {stats ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Total Score" value={stats.totalScore} />
          <StatCard label="League Nights" value={stats.nightsPlayed} />
          <StatCard label="Avg per Night" value={stats.avgPerNight} />
          <StatCard label="Best Night" value={stats.highestNight} />
          <StatCard label="3-for-3 Bonuses" value={stats.totalBonus} />
          <StatCard label="Short Accuracy" value={`${(stats.shortAccuracy * 100).toFixed(1)}%`} />
          <StatCard label="Long Accuracy" value={`${(stats.longAccuracy * 100).toFixed(1)}%`} />
          <StatCard label="Total Made" value={stats.totalMade} sub={`of ${stats.totalAttempts * 3}`} />
        </div>
      ) : (
        <div className="card text-center text-gray-500 py-10">
          No scoring data yet. Play some rounds!
        </div>
      )}
    </div>
  )
}
