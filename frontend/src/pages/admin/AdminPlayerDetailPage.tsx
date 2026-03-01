import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { api } from '../../api/client'
import type { Player, PlayerStats, NightHistory } from '../../api/types'
import Spinner from '../../components/ui/Spinner'

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="card text-center">
      <p className="text-3xl font-bold text-brand-700 dark:text-brand-400">{value}</p>
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-1">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function AdminPlayerDetailPage() {
  const { id } = useParams<{ id: string }>()

  const { data: playerData, isLoading: playerLoading } = useQuery<{ player: Player }>({
    queryKey: ['admin-player', id],
    queryFn: () => api.get(`/admin/players/${id}`),
    enabled: !!id,
  })

  const { data: statsData, isLoading: statsLoading } = useQuery<{ stats: PlayerStats | null }>({
    queryKey: ['player-stats', id],
    queryFn: () => api.get(`/players/${id}/stats`),
    enabled: !!id,
  })

  const { data: historyData, isLoading: historyLoading } = useQuery<{ history: NightHistory[] }>({
    queryKey: ['player-history', id],
    queryFn: () => api.get(`/players/${id}/history`),
    enabled: !!id,
  })

  const isLoading = playerLoading || statsLoading || historyLoading

  if (isLoading) {
    return <div className="flex justify-center py-20"><Spinner className="h-10 w-10" /></div>
  }

  const player = playerData?.player
  const stats = statsData?.stats
  const history = historyData?.history ?? []

  if (!player) {
    return (
      <div className="card text-center py-10 text-gray-500">
        Player not found.{' '}
        <Link to="/admin/players" className="text-brand-600 hover:underline">Back to Players</Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link to="/admin/players" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm">
              ← Players
            </Link>
          </div>
          <h1 className="text-2xl font-bold">{player.user.name}</h1>
          <p className="text-gray-500 text-sm mt-0.5">{player.user.email}</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center pt-1">
          {player.division && (
            <span className="inline-block bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-300 text-xs font-bold px-2 py-1 rounded">
              {player.division.code} — {player.division.name}
            </span>
          )}
          {player.user.isAdmin && (
            <span className="inline-block bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 text-xs font-bold px-2 py-1 rounded">
              Admin
            </span>
          )}
          {!player.isActive && (
            <span className="inline-block bg-red-100 dark:bg-red-900 text-red-600 dark:text-red-400 text-xs font-bold px-2 py-1 rounded">
              Inactive
            </span>
          )}
        </div>
      </div>

      {/* Stats cards */}
      {stats ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Total Score"     value={stats.totalScore} />
          <StatCard label="League Nights"   value={stats.nightsPlayed} />
          <StatCard label="Avg per Night"   value={stats.avgPerNight} />
          <StatCard label="Best Night"      value={stats.highestNight} />
          <StatCard label="3-for-3 Bonuses" value={stats.totalBonus} />
          <StatCard label="Short Accuracy"  value={`${(stats.shortAccuracy * 100).toFixed(1)}%`} />
          <StatCard label="Long Accuracy"   value={`${(stats.longAccuracy * 100).toFixed(1)}%`} />
          <StatCard label="Total Made"      value={stats.totalMade} sub={`of ${stats.totalAttempts * 3}`} />
        </div>
      ) : (
        <div className="card text-center text-gray-500 py-8">
          No scoring data yet.
        </div>
      )}

      {/* Night history */}
      {history.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Night History</h2>
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 text-left">
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 pr-4 font-medium">Season</th>
                <th className="py-2 pr-4 text-right font-medium">Score</th>
                <th className="py-2 text-right font-medium">Bonuses</th>
              </tr>
            </thead>
            <tbody>
              {[...history].reverse().map(n => (
                <tr key={n.leagueNightId} className="border-b border-gray-100 dark:border-gray-800">
                  <td className="py-2 pr-4">
                    <Link
                      to={`/admin/league-nights/${n.leagueNightId}`}
                      className="hover:text-brand-600 hover:underline"
                    >
                      {format(new Date(n.date), 'MMM d, yyyy')}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-gray-500">{n.seasonName}</td>
                  <td className="py-2 pr-4 text-right font-medium">{n.totalScore}</td>
                  <td className="py-2 text-right text-gray-500">
                    {n.bonuses > 0 ? <span className="text-amber-500 font-medium">★ {n.bonuses}</span> : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  )
}
