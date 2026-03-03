import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import type { SeasonFinancialsResponse, NightFinancials } from '../../api/types'
import Spinner from '../../components/ui/Spinner'
import { format } from 'date-fns'
import clsx from 'clsx'

function fmt(n: number) { return `$${n.toLocaleString()}` }

function NightRow({ night, id }: { night: NightFinancials; id: string }) {
  const hasData = night.paidCount > 0
  return (
    <tr className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
      <td className="py-2.5 pl-4 pr-3">
        <Link to={`/admin/league-nights/${night.nightId}/payout`} className="text-sm font-medium text-brand-600 hover:underline">
          {format(new Date(night.date), 'MMM d, yyyy')}
        </Link>
      </td>
      <td className="py-2.5 pr-3">
        <span className={clsx(
          'text-xs px-2 py-0.5 rounded-full font-medium',
          night.status === 'COMPLETED'   && 'bg-green-100 text-green-700',
          night.status === 'IN_PROGRESS' && 'bg-yellow-100 text-yellow-700',
          night.status === 'SCHEDULED'   && 'bg-gray-100 text-gray-500',
          night.status === 'CANCELLED'   && 'bg-red-100 text-red-600',
        )}>
          {night.status.replace('_', ' ')}
        </span>
      </td>
      <td className="py-2.5 pr-3 text-right tabular-nums text-sm text-gray-600">{hasData ? night.paidCount : '—'}</td>
      <td className="py-2.5 pr-3 text-right tabular-nums text-sm font-medium text-green-700 dark:text-green-400">{hasData ? fmt(night.grossCollected) : '—'}</td>
      <td className="py-2.5 pr-3 text-right tabular-nums text-sm text-gray-500">{hasData ? fmt(night.houseTotal) : '—'}</td>
      <td className="py-2.5 pr-3 text-right tabular-nums text-sm text-blue-600 dark:text-blue-400">{hasData ? fmt(night.eoyTotal) : '—'}</td>
      <td className="py-2.5 pr-4 text-right tabular-nums text-sm font-bold text-green-700 dark:text-green-400">{hasData ? fmt(night.payoutPool) : '—'}</td>
    </tr>
  )
}

export default function AdminSeasonFinancialsPage() {
  const { data, isLoading } = useQuery<SeasonFinancialsResponse>({
    queryKey: ['season-financials'],
    queryFn: () => api.get('/admin/seasons/active/financials'),
    refetchInterval: 30_000,
  })

  if (isLoading) return <div className="flex justify-center py-20"><Spinner className="h-10 w-10" /></div>

  const { season, nights = [], totals, settings } = data ?? {}

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Season Financials</h1>
        {season && <p className="text-gray-500 text-sm mt-0.5">{season.name}</p>}
        {!season && <p className="text-gray-400 text-sm mt-0.5">No active season</p>}
      </div>

      {/* Explanation card */}
      <div className="card bg-gray-50 dark:bg-gray-800/30 text-sm text-gray-600 dark:text-gray-400">
        <p>
          Each entry fee is split:{' '}
          <strong className="text-gray-700 dark:text-gray-300">${settings?.housePerEntry ?? '…'} House</strong> (operational) ·{' '}
          <strong className="text-blue-600 dark:text-blue-400">${settings?.eoyPerEntry ?? '…'} End of Year</strong> (season prize pool) ·{' '}
          <strong className="text-green-700 dark:text-green-400">remainder Payout Pool</strong> (distributed night-of).
        </p>
      </div>

      {/* Season totals summary */}
      {totals && totals.paidCount > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="card text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">Gross Collected</p>
            <p className="text-2xl font-bold text-green-700 dark:text-green-400 mt-1">{fmt(totals.grossCollected)}</p>
          </div>
          <div className="card text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">House</p>
            <p className="text-2xl font-bold text-gray-700 dark:text-gray-300 mt-1">{fmt(totals.houseTotal)}</p>
          </div>
          <div className="card text-center">
            <p className="text-xs text-blue-600 dark:text-blue-400 uppercase tracking-wide font-medium">End of Year</p>
            <p className="text-2xl font-bold text-blue-700 dark:text-blue-400 mt-1">{fmt(totals.eoyTotal)}</p>
          </div>
          <div className="card text-center">
            <p className="text-xs text-green-700 dark:text-green-400 uppercase tracking-wide font-medium">Total Paid Out</p>
            <p className="text-2xl font-bold text-green-700 dark:text-green-400 mt-1">{fmt(totals.payoutPool)}</p>
          </div>
        </div>
      )}

      {/* Per-night table */}
      {nights.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">No league nights in the active season yet.</div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left py-3 pl-4 pr-3">Night</th>
                <th className="text-left py-3 pr-3">Status</th>
                <th className="text-right py-3 pr-3">Paid</th>
                <th className="text-right py-3 pr-3">Gross</th>
                <th className="text-right py-3 pr-3">House</th>
                <th className="text-right py-3 pr-3 text-blue-600 dark:text-blue-400">EOY</th>
                <th className="text-right py-3 pr-4 text-green-700 dark:text-green-400">Payout Pool</th>
              </tr>
            </thead>
            <tbody>
              {nights.map(n => (
                <NightRow key={n.nightId} night={n} id={n.nightId} />
              ))}
            </tbody>
            {/* Season totals footer row */}
            {totals && totals.paidCount > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 font-semibold">
                  <td className="py-3 pl-4 pr-3 text-sm">Season Total</td>
                  <td className="py-3 pr-3"></td>
                  <td className="py-3 pr-3 text-right tabular-nums text-sm">{totals.paidCount}</td>
                  <td className="py-3 pr-3 text-right tabular-nums text-sm text-green-700 dark:text-green-400">{fmt(totals.grossCollected)}</td>
                  <td className="py-3 pr-3 text-right tabular-nums text-sm text-gray-600 dark:text-gray-400">{fmt(totals.houseTotal)}</td>
                  <td className="py-3 pr-3 text-right tabular-nums text-sm text-blue-600 dark:text-blue-400">{fmt(totals.eoyTotal)}</td>
                  <td className="py-3 pr-4 text-right tabular-nums text-sm text-green-700 dark:text-green-400">{fmt(totals.payoutPool)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      <p className="text-xs text-center text-gray-400">Refreshes every 30 seconds · Active season only</p>
    </div>
  )
}
