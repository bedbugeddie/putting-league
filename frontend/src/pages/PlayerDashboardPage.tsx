import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../store/auth'
import type { PlayerStats } from '../api/types'
import Spinner from '../components/ui/Spinner'

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="card text-center">
      <p className="text-3xl font-bold text-brand-700">{value}</p>
      <p className="text-sm font-medium text-gray-700 mt-1">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function PlayerDashboardPage() {
  const { user } = useAuth()
  const playerId = user?.player?.id

  const { data: statsData, isLoading: statsLoading } = useQuery<{ stats: PlayerStats | null }>({
    queryKey: ['player-stats', playerId],
    queryFn: () => api.get(`/players/${playerId}/stats`),
    enabled: !!playerId,
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">My Dashboard</h1>
          <p className="text-gray-500 mt-1">Welcome, <strong>{user?.name}</strong>{user?.player?.division?.code ? ` · Division: ${user.player.division.code}` : ''}</p>
        </div>
        <Link to="/profile" className="btn-secondary text-sm">My Profile</Link>
      </div>

      {stats ? (
        <>
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

        </>
      ) : (
        <div className="card text-center text-gray-500 py-10">
          No scoring data yet. Play some rounds!
        </div>
      )}
    </div>
  )
}
