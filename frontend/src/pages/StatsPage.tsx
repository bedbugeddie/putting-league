import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import Spinner from '../components/ui/Spinner'

interface Records {
  topBonusLeaders: { playerId: string; playerName: string; count: number }[]
  highestSingleNight: number
}

export default function StatsPage() {
  const { data, isLoading } = useQuery<{ records: Records }>({
    queryKey: ['league-records'],
    queryFn: () => api.get('/stats/records'),
  })

  if (isLoading) return <div className="flex justify-center py-20"><Spinner className="h-10 w-10" /></div>

  const records = data?.records

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">League Stats & Records</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-lg font-semibold mb-3">🏆 Most 3-for-3 Bonuses</h2>
          {records?.topBonusLeaders.length ? (
            <ol className="space-y-2">
              {records.topBonusLeaders.map((p, i) => (
                <li key={p.playerId} className="flex items-center justify-between">
                  <span className="text-gray-700">#{i + 1} {p.playerName}</span>
                  <span className="font-bold text-yellow-600">★ {p.count}</span>
                </li>
              ))}
            </ol>
          ) : <p className="text-gray-400">No data yet</p>}
        </div>

        <div className="card">
          <h2 className="text-lg font-semibold mb-3">⚡ Highest Single Night</h2>
          <p className="text-5xl font-bold text-brand-700">
            {records?.highestSingleNight ?? 0}
          </p>
          <p className="text-sm text-gray-500 mt-1">points in one league night</p>
        </div>
      </div>
    </div>
  )
}
