import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { Season } from '../api/types'
import Spinner from '../components/ui/Spinner'
import { format } from 'date-fns'

export default function SeasonsPage() {
  const { data, isLoading } = useQuery<{ seasons: Season[] }>({
    queryKey: ['seasons'],
    queryFn: () => api.get('/admin/seasons'),
  })

  if (isLoading) return <div className="flex justify-center py-20"><Spinner className="h-10 w-10" /></div>

  const seasons = data?.seasons ?? []

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Seasons</h1>
      <div className="space-y-3">
        {seasons.map(s => (
          <Link key={s.id} to={`/seasons/${s.id}`} className="card flex items-center justify-between hover:border-brand-300 transition-colors">
            <div>
              <p className="font-semibold">{s.name}</p>
              <p className="text-sm text-gray-500">
                Started {format(new Date(s.startDate), 'MMM d, yyyy')}
                {s.endDate ? ` · Ended ${format(new Date(s.endDate), 'MMM d, yyyy')}` : ''}
                {' '}· {s._count?.leagueNights ?? '?'} nights
              </p>
            </div>
            {s.isActive && <span className="badge bg-green-100 text-green-700">Active</span>}
          </Link>
        ))}
        {seasons.length === 0 && (
          <div className="card text-center text-gray-500 py-10">No seasons yet.</div>
        )}
      </div>
    </div>
  )
}
