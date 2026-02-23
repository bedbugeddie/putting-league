import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api/client'
import type { Season } from '../api/types'
import Spinner from '../components/ui/Spinner'
import SortableHeader from '../components/ui/SortableHeader'
import { useSortable } from '../hooks/useSortable'
import { format } from 'date-fns'

interface SeasonLeaderboardEntry {
  playerId: string; playerName: string; divisionCode: string;
  totalScore: number; nightsPlayed: number; bonuses: number
}

export default function SeasonPage() {
  const { id } = useParams<{ id: string }>()

  const { data: seasonData, isLoading: sl } = useQuery<{ season: Season }>({
    queryKey: ['season', id],
    queryFn: () => api.get(`/admin/seasons/${id}`),
    enabled: !!id,
  })

  const { data: lbData, isLoading: ll } = useQuery<{ leaderboard: SeasonLeaderboardEntry[] }>({
    queryKey: ['season-leaderboard', id],
    queryFn: () => api.get(`/seasons/${id}/leaderboard`),
    enabled: !!id,
  })

  const { sortKey, sortDir, toggleSort } = useSortable('score', 'desc')

  const season = seasonData?.season
  const leaderboard = lbData?.leaderboard ?? []

  const scoreRank = useMemo(() => {
    const map = new Map<string, number>()
    leaderboard.forEach((p, i) => map.set(p.playerId, i + 1))
    return map
  }, [leaderboard])

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    return [...leaderboard].sort((a, b) => {
      switch (sortKey) {
        case 'player':  return dir * a.playerName.localeCompare(b.playerName)
        case 'div':     return dir * a.divisionCode.localeCompare(b.divisionCode)
        case 'nights':  return dir * (a.nightsPlayed - b.nightsPlayed)
        case 'bonuses': return dir * (a.bonuses - b.bonuses)
        case 'score':   return dir * (a.totalScore - b.totalScore)
        default:        return b.totalScore - a.totalScore
      }
    })
  }, [leaderboard, sortKey, sortDir])

  if (sl || ll) return <div className="flex justify-center py-20"><Spinner className="h-10 w-10" /></div>
  if (!season) return <div className="card">Season not found.</div>

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">{season.name}</h1>

      {/* Season-wide leaderboard */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-3">Season Leaderboard</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500">
              <th className="text-left py-2 pr-3 w-8">#</th>
              <SortableHeader sortKey="player"  currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} className="text-left py-2 pr-3">Player</SortableHeader>
              <SortableHeader sortKey="div"     currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} className="text-left py-2 pr-3">Div</SortableHeader>
              <SortableHeader sortKey="nights"  currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} className="text-right py-2 pr-3">Nights</SortableHeader>
              <SortableHeader sortKey="bonuses" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} className="text-right py-2 pr-3">Bonuses</SortableHeader>
              <SortableHeader sortKey="score"   currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} className="text-right py-2 font-bold">Score</SortableHeader>
            </tr>
          </thead>
          <tbody>
            {sorted.map(p => (
              <tr key={p.playerId} className="border-b border-gray-100">
                <td className="py-2 pr-3 text-gray-400">{scoreRank.get(p.playerId)}</td>
                <td className="py-2 pr-3 font-medium">{p.playerName}</td>
                <td className="py-2 pr-3 text-xs text-gray-500">{p.divisionCode}</td>
                <td className="py-2 pr-3 text-right text-gray-500">{p.nightsPlayed}</td>
                <td className="py-2 pr-3 text-right text-yellow-600">{p.bonuses > 0 ? `+${p.bonuses}` : '—'}</td>
                <td className="py-2 text-right font-bold text-brand-700">{p.totalScore}</td>
              </tr>
            ))}
            {leaderboard.length === 0 && (
              <tr><td colSpan={6} className="py-8 text-center text-gray-400">No scores yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
