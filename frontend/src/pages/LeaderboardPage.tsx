import { useState, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useLeaderboard } from '../hooks/useLeaderboard'
import type { PlayerTotals } from '../api/types'
import Spinner from '../components/ui/Spinner'
import SortableHeader from '../components/ui/SortableHeader'
import { useSortable } from '../hooks/useSortable'
import clsx from 'clsx'

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-yellow-500 font-bold">🥇</span>
  if (rank === 2) return <span className="text-gray-400 font-bold">🥈</span>
  if (rank === 3) return <span className="text-amber-600 font-bold">🥉</span>
  return <span className="text-gray-400 font-semibold">#{rank}</span>
}

function LeaderboardTable({ players, title }: { players: PlayerTotals[]; title: string }) {
  const { sortKey, sortDir, toggleSort } = useSortable('score', 'desc')

  // Score rank is fixed from the original backend order; persists across re-sorts
  const scoreRank = useMemo(() => {
    const map = new Map<string, number>()
    players.forEach((p, i) => map.set(p.playerId, i + 1))
    return map
  }, [players])

  const firstPlaceId = players[0]?.playerId

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    return [...players].sort((a, b) => {
      switch (sortKey) {
        case 'player': return dir * a.playerName.localeCompare(b.playerName)
        case 'made':   return dir * (a.totalMade - b.totalMade)
        case 'bonus':  return dir * (a.totalBonus - b.totalBonus)
        case 'score':  return dir * (a.totalScore - b.totalScore)
        case 'short':  return dir * (a.shortMade - b.shortMade)
        case 'long':   return dir * (a.longMade - b.longMade)
        default:       return b.totalScore - a.totalScore
      }
    })
  }, [players, sortKey, sortDir])

  return (
    <div className="card p-0 overflow-hidden">
      <h2 className="text-lg font-semibold px-4 py-3 border-b border-gray-100 dark:border-gray-700">{title}</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-gray-500 bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:bg-gray-700/50">
            <th className="text-left py-2.5 px-4 w-10">#</th>
            <SortableHeader sortKey="player" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} className="text-left py-2.5 pr-3">Player</SortableHeader>
            <SortableHeader sortKey="made"   currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} className="text-right py-2.5 pr-3 hidden sm:table-cell">Made</SortableHeader>
            <SortableHeader sortKey="bonus"  currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} className="text-right py-2.5 pr-3 hidden sm:table-cell">Bonus</SortableHeader>
            <SortableHeader sortKey="score"  currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} className="text-right py-2.5 pr-4 font-bold">Score</SortableHeader>
            <SortableHeader sortKey="short"  currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} className="text-right py-2.5 pr-3 hidden sm:table-cell">Short</SortableHeader>
            <SortableHeader sortKey="long"   currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} className="text-right py-2.5 pr-4 hidden sm:table-cell">Long</SortableHeader>
          </tr>
        </thead>
        <tbody>
          {sorted.map(p => (
            <tr
              key={p.playerId}
              className={clsx(
                'border-b border-gray-100 dark:border-gray-700',
                p.playerId === firstPlaceId ? 'bg-yellow-50 dark:bg-yellow-900/20' : '',
              )}
            >
              <td className="py-3 px-4"><RankBadge rank={scoreRank.get(p.playerId) ?? 0} /></td>
              <td className="py-3 pr-3 font-medium">
                <span className="block">{p.playerName}</span>
                {p.totalBonus > 0 && (
                  <span className="text-xs text-yellow-600 sm:hidden">+{p.totalBonus} ★</span>
                )}
              </td>
              <td className="py-3 pr-3 text-right text-gray-600 hidden sm:table-cell">{p.totalMade}</td>
              <td className="py-3 pr-3 text-right text-yellow-600 hidden sm:table-cell">
                {p.totalBonus > 0 ? `+${p.totalBonus}` : '—'}
              </td>
              <td className="py-3 pr-4 text-right font-bold text-brand-700 text-base">{p.totalScore}</td>
              <td className="py-3 pr-3 text-right text-gray-500 hidden sm:table-cell">{p.shortMade}</td>
              <td className="py-3 pr-4 text-right text-gray-500 hidden sm:table-cell">{p.longMade}</td>
            </tr>
          ))}
          {players.length === 0 && (
            <tr><td colSpan={7} className="py-8 text-center text-gray-400">No scores yet</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

export default function LeaderboardPage() {
  const { id } = useParams<{ id: string }>()
  const { data, isLoading, connected } = useLeaderboard(id ?? null)
  const [tab, setTab] = useState<'overall' | string>('overall')

  if (isLoading) return <div className="flex justify-center py-20"><Spinner className="h-10 w-10" /></div>

  const overall = data?.overall ?? []
  const byDivision = data?.byDivision ?? {}
  const divisions = Object.keys(byDivision).sort()

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl sm:text-3xl font-bold">Leaderboard</h1>
        <div className={clsx(
          'flex items-center gap-2 text-xs sm:text-sm px-3 py-1 rounded-full',
          connected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
        )}>
          <span className={clsx('w-2 h-2 rounded-full shrink-0', connected ? 'bg-green-500' : 'bg-gray-400')} />
          {connected ? 'Live' : 'Connecting…'}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setTab('overall')}
          className={clsx('btn shrink-0', tab === 'overall' ? 'btn-primary' : 'btn-secondary')}
        >
          Overall
        </button>
        {divisions.map(d => (
          <button
            key={d}
            onClick={() => setTab(d)}
            className={clsx('btn shrink-0', tab === d ? 'btn-primary' : 'btn-secondary')}
          >
            {d}
          </button>
        ))}
      </div>

      {tab === 'overall'
        ? <LeaderboardTable players={overall} title="Overall" />
        : <LeaderboardTable players={byDivision[tab] ?? []} title={`Division ${tab}`} />
      }
    </div>
  )
}
