import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { api } from '../api/client'
import Spinner from '../components/ui/Spinner'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Records {
  topBonusLeaders: {
    playerId: string
    playerName: string
    divisionCode: string
    count: number
  }[]
  highestSingleNight: number
  highestByDivision: { divisionCode: string; score: number }[]
  topNightScores: {
    playerId: string
    playerName: string
    divisionCode: string
    score: number
    date: string
  }[]
  topNightScoresByDivision: Record<string, {
    playerId: string
    playerName: string
    divisionCode: string
    score: number
    date: string
  }[]>
}

interface NightAveragesData {
  data: Record<string, string | number | null>[]
  divisions: { code: string; name: string }[]
}

// ── Colors for chart lines ─────────────────────────────────────────────────────

const DIVISION_COLORS = [
  '#16a34a', '#2563eb', '#dc2626', '#d97706',
  '#7c3aed', '#0891b2', '#be185d', '#78716c',
]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function StatsPage() {
  const [divFilter, setDivFilter] = useState<string | null>(null)

  const { data: recordsData, isLoading: recordsLoading } = useQuery<{ records: Records }>({
    queryKey: ['league-records'],
    queryFn: () => api.get('/stats/records'),
  })

  const { data: avgData, isLoading: avgLoading } = useQuery<NightAveragesData>({
    queryKey: ['night-averages'],
    queryFn: () => api.get('/stats/night-averages'),
  })

  if (recordsLoading || avgLoading) {
    return <div className="flex justify-center py-20"><Spinner className="h-10 w-10" /></div>
  }

  const records = recordsData?.records
  const divisions = avgData?.divisions ?? []

  // ── Filtered data ──────────────────────────────────────────────────────────

  const filteredBonusLeaders = (records?.topBonusLeaders ?? [])
    .filter(p => !divFilter || p.divisionCode === divFilter)
    .slice(0, 5)

  // When a division is selected, use the pre-computed per-division top-5 so
  // divisions with scores outside the overall top-5 still have data to show.
  const filteredTopScores = divFilter
    ? (records?.topNightScoresByDivision?.[divFilter] ?? [])
    : (records?.topNightScores ?? [])

  // Highest-by-division: when filtered just the one entry, otherwise all in score order
  const highestByDivision = divFilter
    ? (records?.highestByDivision ?? []).filter(d => d.divisionCode === divFilter)
    : (records?.highestByDivision ?? [])

  // ── Graph data ─────────────────────────────────────────────────────────────
  // When a division is selected, show only that line; otherwise show all.
  const graphDivisions = divFilter
    ? divisions.filter(d => d.code === divFilter)
    : divisions

  const graphData = (avgData?.data ?? []).map(row => {
    const entry: Record<string, string | number | null> = { date: row.date as string }
    for (const div of graphDivisions) {
      entry[div.code] = row[div.code] as number | null
    }
    return entry
  })

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">League Stats & Records</h1>

      {/* Division filter */}
      {divisions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setDivFilter(null)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              !divFilter
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            All Divisions
          </button>
          {divisions.map(div => (
            <button
              key={div.code}
              onClick={() => setDivFilter(divFilter === div.code ? null : div.code)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                divFilter === div.code
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {div.code}
            </button>
          ))}
        </div>
      )}

      {/* Stat tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

        {/* Most 3-for-3 Bonuses */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-3">🏆 Most 3-for-3 Bonuses</h2>
          {filteredBonusLeaders.length ? (
            <ol className="space-y-2">
              {filteredBonusLeaders.map((p, i) => (
                <li key={p.playerId} className="flex items-center justify-between">
                  <span className="text-gray-700 dark:text-gray-300">
                    #{i + 1} {p.playerName}
                    <span className="ml-2 text-xs text-gray-400">{p.divisionCode}</span>
                  </span>
                  <span className="font-bold text-yellow-600">★ {p.count}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-gray-400">No data yet</p>
          )}
        </div>

        {/* Highest Single Night */}
        <div className="card">
          <h2 className="text-lg font-semibold mb-3">⚡ Highest Single Night</h2>
          {highestByDivision.length === 0 ? (
            <p className="text-gray-400">No data yet</p>
          ) : highestByDivision.length === 1 ? (
            /* Single division selected — big number display */
            <>
              <p className="text-5xl font-bold text-brand-700">{highestByDivision[0].score}</p>
              <p className="text-sm text-gray-500 mt-1">
                points in one league night · {highestByDivision[0].divisionCode}
              </p>
            </>
          ) : (
            /* All divisions — per-division list */
            <ul className="space-y-2">
              {highestByDivision.map(d => (
                <li key={d.divisionCode} className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    {d.divisionCode}
                  </span>
                  <span className="text-2xl font-bold text-brand-700">{d.score}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Top Scoring Players */}
        <div className="card sm:col-span-2">
          <h2 className="text-lg font-semibold mb-3">🔥 Top Scoring Players</h2>
          {filteredTopScores.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left pb-2 font-medium text-gray-500 text-xs">#</th>
                    <th className="text-left pb-2 font-medium text-gray-500 text-xs">Player</th>
                    <th className="text-left pb-2 font-medium text-gray-500 text-xs">Division</th>
                    <th className="text-left pb-2 font-medium text-gray-500 text-xs">Date</th>
                    <th className="text-right pb-2 font-medium text-gray-500 text-xs">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTopScores.map((s, i) => (
                    <tr
                      key={`${s.playerId}-${s.date}`}
                      className="border-b border-gray-100 dark:border-gray-800 last:border-0"
                    >
                      <td className="py-2.5 text-gray-400 text-xs font-mono">{i + 1}</td>
                      <td className="py-2.5 font-medium">{s.playerName}</td>
                      <td className="py-2.5 text-gray-500 text-xs">{s.divisionCode}</td>
                      <td className="py-2.5 text-gray-500 text-xs">
                        {format(new Date(s.date), 'MMM d, yyyy')}
                      </td>
                      <td className="py-2.5 text-right font-bold text-brand-700">{s.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-400">No data yet</p>
          )}
        </div>
      </div>

      {/* Avg Score Per Event line graph */}
      {graphData.length > 0 && graphDivisions.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">📈 Avg Score Per Event</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={graphData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                tickFormatter={(v: string) => {
                  try { return format(new Date(v), 'MMM d') } catch { return v }
                }}
                tick={{ fontSize: 11, fill: '#6b7280' }}
              />
              <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} />
              <Tooltip
                labelFormatter={(v) => {
                  try { return format(new Date(v as string), 'MMMM d, yyyy') } catch { return String(v) }
                }}
                formatter={(value, name) => [
                  value != null ? Number(value).toFixed(2) : '—',
                  name as string,
                ]}
              />
              <Legend />
              {graphDivisions.map((div, i) => (
                <Line
                  key={div.code}
                  type="monotone"
                  dataKey={div.code}
                  name={div.name}
                  stroke={DIVISION_COLORS[i % DIVISION_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
