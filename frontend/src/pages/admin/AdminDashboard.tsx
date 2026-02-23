import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import type { LeagueNight, Season } from '../../api/types'
import StatusBadge from '../../components/ui/StatusBadge'
import { format } from 'date-fns'

export default function AdminDashboard() {
  const { data: nightsData } = useQuery<{ leagueNights: LeagueNight[] }>({
    queryKey: ['league-nights'],
    queryFn: () => api.get('/league-nights'),
  })

  const nights = (nightsData?.leagueNights ?? []).slice(0, 5)
  const active = nights.find(n => n.status === 'IN_PROGRESS')

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Admin Dashboard</h1>

      {active && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="font-semibold text-green-800">● Active League Night</p>
            <p className="text-sm text-green-700">{format(new Date(active.date), 'EEEE, MMMM d, yyyy')}</p>
          </div>
          <div className="flex gap-2">
            <Link to={`/scoring/${active.id}`} className="btn-primary text-sm">Enter Scores</Link>
            <Link to={`/league-nights/${active.id}/leaderboard`} className="btn-secondary text-sm">Leaderboard</Link>
          </div>
        </div>
      )}

      {/* Quick nav */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'League Nights', to: '/admin/league-nights', icon: '📅' },
          { label: 'Players', to: '/admin/players', icon: '👤' },
          { label: 'Seasons', to: '/admin/seasons', icon: '🏆' },
          { label: 'Divisions', to: '/admin/divisions', icon: '🎯' },
        ].map(item => (
          <Link key={item.to} to={item.to} className="card flex flex-col items-center gap-2 hover:border-brand-400 transition-colors text-center">
            <span className="text-3xl">{item.icon}</span>
            <span className="font-medium text-sm">{item.label}</span>
          </Link>
        ))}
      </div>

      {/* Recent nights */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Recent League Nights</h2>
          <Link to="/admin/league-nights" className="text-sm text-brand-600 hover:underline">View all →</Link>
        </div>
        <div className="space-y-2">
          {nights.map(n => (
            <Link key={n.id} to={`/admin/league-nights/${n.id}`} className="flex items-center justify-between p-2 rounded hover:bg-gray-50">
              <span className="text-sm font-medium">{format(new Date(n.date), 'MMM d, yyyy')}</span>
              <StatusBadge status={n.status} />
            </Link>
          ))}
          {nights.length === 0 && <p className="text-gray-400 text-sm">No league nights yet.</p>}
        </div>
      </div>
    </div>
  )
}
