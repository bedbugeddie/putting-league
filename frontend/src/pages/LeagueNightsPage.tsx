import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { LeagueNight } from '../api/types'
import StatusBadge from '../components/ui/StatusBadge'
import Spinner from '../components/ui/Spinner'
import { format } from 'date-fns'

export default function LeagueNightsPage() {
  const { data, isLoading } = useQuery<{ leagueNights: LeagueNight[] }>({
    queryKey: ['league-nights'],
    queryFn: () => api.get('/league-nights'),
  })

  if (isLoading) return <div className="flex justify-center py-20"><Spinner className="h-10 w-10" /></div>

  const live = (data?.leagueNights ?? []).filter(n => n.status === 'IN_PROGRESS')

  return (
    <div>
      <div className="flex justify-center mb-8">
        <img
          src="/mvpl.png"
          alt="Merrimack Valley Putting League"
          className="w-64 sm:w-80 [filter:brightness(0)_invert(14%)_sepia(100%)_saturate(500%)_hue-rotate(350deg)_brightness(80%)] dark:[filter:brightness(0)_invert(78%)_sepia(55%)_saturate(150%)_hue-rotate(350deg)]"
        />
      </div>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold">Current Event</h1>
      </div>

      {live.length === 0 && (
        <div className="card text-center text-gray-500 py-12">No live events right now.</div>
      )}

      <div className="space-y-3">
        {live.map(night => (
          <Link
            key={night.id}
            to={`/league-nights/${night.id}`}
            className="card flex items-center justify-between hover:border-brand-300 transition-colors"
          >
            <div>
              <p className="font-semibold">
                {format(new Date(night.date), 'EEEE, MMMM d, yyyy')}
              </p>
              <p className="text-sm text-gray-500">
                {night.season?.name} · {night._count?.holes ?? '?'} holes · {night._count?.rounds ?? '?'} rounds
              </p>
            </div>
            <StatusBadge status={night.status} />
          </Link>
        ))}
      </div>
    </div>
  )
}
