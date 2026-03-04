import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import type { SeasonFinancialsResponse, NightFinancials } from '../../api/types'
import Spinner from '../../components/ui/Spinner'
import { format } from 'date-fns'
import clsx from 'clsx'

function fmt(n: number) { return `$${n.toLocaleString()}` }

function NightRow({ night }: { night: NightFinancials }) {
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
      <td className="py-2.5 pr-3 text-right tabular-nums text-sm text-blue-600 dark:text-blue-400">
        {hasData ? (
          <>
            {fmt(night.eoyTotal)}
            {night.payoutRemainder > 0 && (
              <span className="ml-1 text-blue-400 text-xs">(+{fmt(night.payoutRemainder)})</span>
            )}
          </>
        ) : '—'}
      </td>
      <td className="py-2.5 pr-4 text-right tabular-nums text-sm font-bold text-green-700 dark:text-green-400">{hasData ? fmt(night.payoutPool) : '—'}</td>
    </tr>
  )
}

// ── Export helpers ────────────────────────────────────────────────────────────

function downloadCsv(nights: NightFinancials[], seasonName: string) {
  const header = ['Date', 'Status', 'Paid Players', 'Gross Collected', 'House', 'EOY', 'EOY Rounding', 'Payout Pool']
  const rows = nights.map(n => [
    format(new Date(n.date), 'MMM d, yyyy'),
    n.status.replace('_', ' '),
    n.paidCount > 0 ? n.paidCount : '',
    n.paidCount > 0 ? n.grossCollected : '',
    n.paidCount > 0 ? n.houseTotal : '',
    n.paidCount > 0 ? n.eoyTotal : '',
    n.paidCount > 0 && n.payoutRemainder > 0 ? n.payoutRemainder : '',
    n.paidCount > 0 ? n.payoutPool : '',
  ])

  const csv = [header, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `${seasonName.replace(/\s+/g, '-')}-financials.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function openPrintReport(
  nights: NightFinancials[],
  seasonName: string,
  housePerEntry: number,
  eoyPerEntry: number,
  totals: { paidCount: number; grossCollected: number; houseTotal: number; eoyTotal: number; payoutPool: number },
) {
  const fmtD = (d: string) => format(new Date(d), 'MMM d, yyyy')
  const fmtN = (n: number) => `$${n.toLocaleString()}`
  const generatedAt = format(new Date(), 'MMMM d, yyyy \'at\' h:mm a')

  const nightRows = nights.map(n => {
    const has = n.paidCount > 0
    const rem = has && n.payoutRemainder > 0 ? `<span class="rounding">+${fmtN(n.payoutRemainder)}</span>` : ''
    return `
      <tr>
        <td>${fmtD(n.date)}</td>
        <td>${n.status.replace('_', ' ')}</td>
        <td class="num">${has ? n.paidCount : '—'}</td>
        <td class="num">${has ? fmtN(n.grossCollected) : '—'}</td>
        <td class="num">${has ? fmtN(n.houseTotal) : '—'}</td>
        <td class="num eoy">${has ? fmtN(n.eoyTotal) : '—'}${rem}</td>
        <td class="num payout">${has ? fmtN(n.payoutPool) : '—'}</td>
      </tr>`
  }).join('')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${seasonName} – Financial Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; font-size: 13px; color: #111; padding: 36px 48px; }
    header { margin-bottom: 28px; }
    header h1 { font-size: 22px; font-weight: 700; }
    header p  { color: #555; margin-top: 4px; font-size: 12px; }

    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 28px; }
    .summary-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 16px; text-align: center; }
    .summary-card .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; font-weight: 600; }
    .summary-card .value { font-size: 22px; font-weight: 700; margin-top: 4px; }
    .summary-card.gross .value { color: #15803d; }
    .summary-card.house .value { color: #374151; }
    .summary-card.eoy   .value { color: #1d4ed8; }
    .summary-card.paid  .value { color: #15803d; }

    .rule { font-size: 11px; color: #6b7280; margin-bottom: 20px; padding: 10px 14px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; }

    table { width: 100%; border-collapse: collapse; }
    thead th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; padding: 8px 10px; border-bottom: 2px solid #e5e7eb; background: #f9fafb; }
    th.num, td.num { text-align: right; }
    td { padding: 7px 10px; border-bottom: 1px solid #f3f4f6; font-size: 12px; }
    td.eoy    { color: #1d4ed8; }
    td.payout { color: #15803d; font-weight: 600; }
    .rounding { font-size: 10px; color: #93c5fd; margin-left: 4px; }
    tfoot td { font-weight: 700; border-top: 2px solid #d1d5db; background: #f9fafb; padding: 9px 10px; }
    tfoot td.eoy    { color: #1d4ed8; }
    tfoot td.payout { color: #15803d; }

    footer { margin-top: 28px; font-size: 10px; color: #9ca3af; text-align: center; }
  </style>
</head>
<body>
  <header>
    <h1>Merrimack Valley Putting League</h1>
    <p>${seasonName} · Financial Report · Generated ${generatedAt}</p>
  </header>

  <div class="rule">
    Entry fee split: <strong>$${housePerEntry} House</strong> (operational) ·
    <strong>$${eoyPerEntry} End of Year</strong> (season prize pool) ·
    <strong>remainder Payout Pool</strong> (distributed night-of)
  </div>

  <div class="summary">
    <div class="summary-card gross">
      <div class="label">Gross Collected</div>
      <div class="value">${fmtN(totals.grossCollected)}</div>
    </div>
    <div class="summary-card house">
      <div class="label">House</div>
      <div class="value">${fmtN(totals.houseTotal)}</div>
    </div>
    <div class="summary-card eoy">
      <div class="label">End of Year Pool</div>
      <div class="value">${fmtN(totals.eoyTotal)}</div>
      ${totals.payoutRemainder > 0 ? `<div style="font-size:10px;color:#93c5fd;margin-top:2px">+${fmtN(totals.payoutRemainder)} rounding</div>` : ''}
    </div>
    <div class="summary-card paid">
      <div class="label">Total Paid Out</div>
      <div class="value">${fmtN(totals.payoutPool)}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Night</th>
        <th>Status</th>
        <th class="num">Paid Players</th>
        <th class="num">Gross</th>
        <th class="num">House</th>
        <th class="num">EOY</th>
        <th class="num">Payout Pool</th>
      </tr>
    </thead>
    <tbody>${nightRows}</tbody>
    <tfoot>
      <tr>
        <td colspan="2">Season Total</td>
        <td class="num">${totals.paidCount}</td>
        <td class="num">${fmtN(totals.grossCollected)}</td>
        <td class="num">${fmtN(totals.houseTotal)}</td>
        <td class="num eoy">${fmtN(totals.eoyTotal)}${totals.payoutRemainder > 0 ? ` <span class="rounding">(+${fmtN(totals.payoutRemainder)})</span>` : ''}</td>
        <td class="num payout">${fmtN(totals.payoutPool)}</td>
      </tr>
    </tfoot>
  </table>

  <footer>mvpl.golf · ${seasonName} · Confidential</footer>

  <script>window.onload = () => window.print()</script>
</body>
</html>`

  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(html)
  win.document.close()
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AdminSeasonFinancialsPage() {
  const { data, isLoading } = useQuery<SeasonFinancialsResponse>({
    queryKey: ['season-financials'],
    queryFn: () => api.get('/admin/seasons/active/financials'),
    refetchInterval: 30_000,
  })

  if (isLoading) return <div className="flex justify-center py-20"><Spinner className="h-10 w-10" /></div>

  const { season, nights = [], totals, settings } = data ?? {}
  const hasData = !!totals && totals.paidCount > 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link to="/admin" className="text-sm text-brand-600 hover:underline">← Dashboard</Link>
          <h1 className="text-2xl font-bold">Season Financials</h1>
          {season  && <p className="text-gray-500 text-sm mt-0.5">{season.name}</p>}
          {!season && <p className="text-gray-400 text-sm mt-0.5">No active season</p>}
        </div>

        {hasData && season && totals && settings && (
          <div className="flex gap-2 shrink-0 pt-5">
            <button
              onClick={() => downloadCsv(nights, season.name)}
              className="btn-secondary text-sm flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              Download CSV
            </button>
            <button
              onClick={() => openPrintReport(nights, season.name, settings.housePerEntry, settings.eoyPerEntry, totals)}
              className="btn-secondary text-sm flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a1 1 0 001 1h8a1 1 0 001-1v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm-1 9h8v4H6v-4zm8-4a1 1 0 110 2 1 1 0 010-2z" clipRule="evenodd" />
              </svg>
              Print / Save PDF
            </button>
          </div>
        )}
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
      {hasData && totals && (
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
            {totals.payoutRemainder > 0 && (
              <p className="text-xs text-blue-400 mt-0.5">+{fmt(totals.payoutRemainder)} rounding</p>
            )}
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
                <NightRow key={n.nightId} night={n} />
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
                  <td className="py-3 pr-3 text-right tabular-nums text-sm text-blue-600 dark:text-blue-400">
                    {fmt(totals.eoyTotal)}
                    {totals.payoutRemainder > 0 && (
                      <span className="ml-1 text-blue-400 text-xs">(+{fmt(totals.payoutRemainder)})</span>
                    )}
                  </td>
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
