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
    /* Hero wrapper: full-bleed on all screen sizes */
    <div className="home-hero -mx-4 sm:-mx-6 lg:-mx-8 -mt-6 min-h-[calc(100svh-3.5rem)] relative">
      {/* Dark scrim – lighter on desktop, heavier on mobile */}
      <div className="absolute inset-0 bg-black/30 sm:bg-black/20 dark:bg-black/50 pointer-events-none" />

      {/* Content – padding restored to match Layout's removed margins */}
      <div className="relative px-4 sm:px-6 lg:px-8 pt-6 pb-8">
        <div className="flex justify-center mb-8">
          <img
            src="/mvpl.png"
            alt="Merrimack Valley Putting League"
            className="w-64 sm:w-80 [filter:brightness(0)_invert(100%)]"
          />
        </div>

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Current Event</h1>
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
    </div>
  )
}
