import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../api/client'
import type { LeagueNight } from '../../api/types'
import StatusBadge from '../../components/ui/StatusBadge'
import { format } from 'date-fns'

export default function AdminDashboard() {
  const navigate = useNavigate()
  const { data: nightsData } = useQuery<{ leagueNights: LeagueNight[] }>({
    queryKey: ['league-nights'],
    queryFn: () => api.get('/league-nights'),
  })

  const allNights = nightsData?.leagueNights ?? []
  const active = allNights.find(n => n.status === 'IN_PROGRESS')
  const nights = allNights
    .filter(n => n.status === 'SCHEDULED' || n.status === 'IN_PROGRESS')
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 5)
  const pastNights = allNights
    .filter(n => n.status === 'COMPLETED')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5)

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Admin Dashboard</h1>

      {active && (
        <div
          onClick={() => navigate(`/admin/league-nights/${active.id}`)}
          className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center justify-between hover:border-green-300 transition-colors cursor-pointer"
        >
          <div>
            <p className="font-semibold text-green-800">● Active League Night</p>
            <p className="text-sm text-green-700">{format(new Date(active.date), 'EEEE, MMMM d, yyyy')}</p>
          </div>
          <div className="flex gap-2" onClick={e => e.stopPropagation()}>
            <Link to={`/admin/league-nights/${active.id}/scoring`} className="btn-primary text-sm">Enter Scores</Link>
            <Link to={`/league-nights/${active.id}/leaderboard`} state={{ forceOverall: true }} className="btn-secondary text-sm">Leaderboard</Link>
          </div>
        </div>
      )}

      {/* Quick nav */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Seasons', to: '/admin/seasons', icon: '🏆' },
          { label: 'League Nights', to: '/admin/league-nights', icon: '📅' },
          { label: 'Divisions', to: '/admin/divisions', icon: '🎯' },
          { label: 'Players', to: '/admin/players', icon: '👤' },
        ].map(item => (
          <Link key={item.to} to={item.to} className="card flex flex-col items-center gap-2 hover:border-brand-400 transition-colors text-center">
            <span className="text-3xl">{item.icon}</span>
            <span className="font-medium text-sm">{item.label}</span>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Upcoming nights */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Upcoming League Nights</h2>
            <Link to="/admin/league-nights" className="text-sm text-brand-600 hover:underline">View all →</Link>
          </div>
          <div className="space-y-2">
            {nights.map(n => (
              <Link key={n.id} to={`/admin/league-nights/${n.id}`} className="flex items-center justify-between p-2 rounded hover:bg-gray-50">
                <span className="text-sm font-medium">{format(new Date(n.date), 'MMM d, yyyy')}</span>
                <StatusBadge status={n.status} />
              </Link>
            ))}
            {nights.length === 0 && <p className="text-gray-400 text-sm">No upcoming league nights.</p>}
          </div>
        </div>

        {/* Past nights */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Past League Nights</h2>
            <Link to="/admin/league-nights" className="text-sm text-brand-600 hover:underline">View all →</Link>
          </div>
          <div className="space-y-2">
            {pastNights.map(n => (
              <Link key={n.id} to={`/admin/league-nights/${n.id}`} className="flex items-center justify-between p-2 rounded hover:bg-gray-50">
                <span className="text-sm font-medium">{format(new Date(n.date), 'MMM d, yyyy')}</span>
                <StatusBadge status={n.status} />
              </Link>
            ))}
            {pastNights.length === 0 && <p className="text-gray-400 text-sm">No completed league nights.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
