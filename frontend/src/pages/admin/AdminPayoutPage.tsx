import { useQuery } from '@tanstack/react-query'
import { useParams, Link } from 'react-router-dom'
import { api } from '../../api/client'
import type { PayoutsResponse, PayoutEntry, LeagueNight } from '../../api/types'
import Spinner from '../../components/ui/Spinner'
import { format } from 'date-fns'
import clsx from 'clsx'

function placeLabel(n: number) {
  if (n === 1) return '1st'
  if (n === 2) return '2nd'
  if (n === 3) return '3rd'
  return `${n}th`
}

function PlaceRow({ entry, pool }: { entry: PayoutEntry; pool: number }) {
  const inTheMoney = entry.payout > 0
  const pct = pool > 0 ? ((entry.payout / pool) * 100).toFixed(1) : '0.0'

  return (
    <tr className={clsx(
      'border-b border-gray-100 dark:border-gray-700',
      inTheMoney && 'bg-green-50/50 dark:bg-green-900/10',
    )}>
      <td className="py-2.5 pl-4 pr-3 w-12">
        <span className={clsx(
          'text-sm font-bold',
          entry.place === 1 && 'text-yellow-600',
          entry.place === 2 && 'text-gray-500',
          entry.place === 3 && 'text-amber-700',
          entry.place > 3 && 'text-gray-400',
        )}>
          {placeLabel(entry.place)}
        </span>
      </td>
      <td className="py-2.5 pr-3">
        <span className="text-sm font-medium">{entry.playerName}</span>
        {entry.isTied && (
          <span className="ml-1.5 text-xs text-gray-400">
            {entry.pendingPuttOff ? '(tied – putt-off pending)' : '(tied – split)'}
          </span>
        )}
      </td>
      <td className="py-2.5 pr-3 text-right text-sm text-gray-500 tabular-nums">
        {entry.totalScore}
      </td>
      <td className="py-2.5 pr-4 text-right tabular-nums">
        {entry.pendingPuttOff ? (
          <span className="text-xs text-amber-600 font-medium">TBD</span>
        ) : inTheMoney ? (
          <span className="text-sm font-bold text-green-700 dark:text-green-400">
            ${entry.payout} <span className="text-xs font-normal text-gray-400">({pct}%)</span>
          </span>
        ) : (
          <span className="text-sm text-gray-400">—</span>
        )}
      </td>
    </tr>
  )
}

export default function AdminPayoutPage() {
  const { id } = useParams<{ id: string }>()

  const { data: nightData } = useQuery<{ leagueNight: LeagueNight }>({
    queryKey: ['league-night', id],
    queryFn: () => api.get(`/league-nights/${id}`),
    enabled: !!id,
  })

  const { data, isLoading, refetch } = useQuery<PayoutsResponse>({
    queryKey: ['payouts', id],
    queryFn: () => api.get(`/admin/league-nights/${id}/payouts`),
    enabled: !!id,
    refetchInterval: 15_000,
  })

  if (isLoading) return <div className="flex justify-center py-20"><Spinner className="h-10 w-10" /></div>

  const night = nightData?.leagueNight
  const { tieBreakerMode, divisions = [] } = data ?? {}

  const totalPool = divisions.reduce((sum, d) => sum + d.pool, 0)
  const totalPaid = divisions.reduce((sum, d) => sum + d.paidCount, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link to={`/admin/league-nights/${id}`} className="text-sm text-brand-600 hover:underline">← Night Details</Link>
        <div className="flex items-start justify-between mt-1">
          <div>
            <h1 className="text-2xl font-bold">Payout Calculator</h1>
            {night && (
              <p className="text-gray-500 text-sm">{format(new Date(night.date), 'EEEE, MMMM d, yyyy')}</p>
            )}
          </div>
          <button onClick={() => refetch()} className="btn-secondary text-xs">Refresh</button>
        </div>
      </div>

      {/* Summary bar */}
      {totalPaid > 0 && (
        <div className="card bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
          <div className="flex flex-wrap gap-6">
            <div>
              <p className="text-xs text-green-700 dark:text-green-400 font-medium uppercase tracking-wide">Total Pool</p>
              <p className="text-3xl font-bold text-green-800 dark:text-green-300">${totalPool}</p>
            </div>
            <div>
              <p className="text-xs text-green-700 dark:text-green-400 font-medium uppercase tracking-wide">Players Paid</p>
              <p className="text-2xl font-bold text-green-800 dark:text-green-300">{totalPaid}</p>
            </div>
            <div>
              <p className="text-xs text-green-700 dark:text-green-400 font-medium uppercase tracking-wide">Tie-Breaker Mode</p>
              <p className="text-lg font-semibold text-green-800 dark:text-green-300">{tieBreakerMode === 'SPLIT' ? 'Split ties' : 'Putt-off'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Per-division breakdown */}
      {divisions.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          No check-ins yet. Check in players and mark them as paid to see payouts.
        </div>
      ) : (
        divisions.map(div => (
          <div key={div.divisionId} className="card">
            {/* Division header */}
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-brand-700 dark:text-brand-400 text-lg">{div.divisionCode}</span>
                  <span className="text-gray-600 dark:text-gray-400">{div.divisionName}</span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  ${div.entryFee.toFixed(2)} entry fee · {div.checkedInCount} checked in · {div.paidCount} paid
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-green-700 dark:text-green-400">
                  ${div.pool}
                </p>
                <p className="text-xs text-gray-500">prize pool</p>
              </div>
            </div>

            {/* Payout tier info */}
            {div.paidCount > 0 && div.percentages.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {div.percentages.map((pct, i) => (
                  <span key={i} className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">
                    {placeLabel(i + 1)}: {(pct * 100).toFixed(1)}% = ${Math.round(div.pool * pct)}
                  </span>
                ))}
              </div>
            )}

            {/* No paid players */}
            {div.paidCount === 0 ? (
              <p className="text-sm text-gray-400 italic">
                No players have paid their entry fee yet. Mark payments on the{' '}
                <Link to={`/admin/league-nights/${id}/checkin`} className="text-brand-600 hover:underline">
                  check-in page
                </Link>.
              </p>
            ) : div.payouts.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No scores entered yet.</p>
            ) : (
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-2 pl-4 pr-3 w-12">Place</th>
                      <th className="text-left py-2 pr-3">Player</th>
                      <th className="text-right py-2 pr-3">Score</th>
                      <th className="text-right py-2 pr-4">Payout</th>
                    </tr>
                  </thead>
                  <tbody>
                    {div.payouts.map((entry, i) => (
                      <PlaceRow key={`${entry.playerId}-${i}`} entry={entry} pool={div.pool} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))
      )}

      {/* Footer note */}
      <p className="text-xs text-center text-gray-400">
        Payouts refresh every 15 seconds. Based on players marked as paid on the check-in page.
      </p>
    </div>
  )
}
