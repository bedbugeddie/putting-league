import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, Link } from 'react-router-dom'
import { api } from '../../api/client'
import type { LeagueNight, User, Card, Score } from '../../api/types'
import StatusBadge from '../../components/ui/StatusBadge'
import Spinner from '../../components/ui/Spinner'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { useState } from 'react'

export default function AdminLeagueNightDetailPage() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const [skUserId, setSkUserId] = useState('')

  const { data, isLoading } = useQuery<{ leagueNight: LeagueNight }>({
    queryKey: ['league-night', id],
    queryFn: () => api.get(`/league-nights/${id}`),
    enabled: !!id,
  })

  const { data: usersData } = useQuery<{ users: User[] }>({
    queryKey: ['admin-users'],
    queryFn: () => api.get('/admin/users'),
  })

  const { data: cardsData } = useQuery<{ cards: Card[] }>({
    queryKey: ['cards', id],
    queryFn: () => api.get(`/league-nights/${id}/cards`),
    enabled: !!id,
  })

  const { data: scoresData } = useQuery<{ scores: Score[] }>({
    queryKey: ['scores', id],
    queryFn: () => api.get(`/league-nights/${id}/scores`),
    enabled: !!id,
    refetchInterval: 15_000,
  })

  const statusMut = useMutation({
    mutationFn: (status: string) => api.patch(`/admin/league-nights/${id}`, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['league-night', id] }); toast.success('Status updated') },
    onError: (e: any) => toast.error(e.message),
  })

  const addSkMut = useMutation({
    mutationFn: (userId: string) => api.post(`/admin/league-nights/${id}/scorekeepers`, { userId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['league-night', id] }); toast.success('Scorekeeper assigned') },
    onError: (e: any) => toast.error(e.message),
  })

  const removeSkMut = useMutation({
    mutationFn: (userId: string) => api.delete(`/admin/league-nights/${id}/scorekeepers/${userId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['league-night', id] }); toast.success('Scorekeeper removed') },
    onError: (e: any) => toast.error(e.message),
  })

  if (isLoading) return <div className="flex justify-center py-20"><Spinner className="h-10 w-10" /></div>

  const night = data?.leagueNight
  if (!night) return <div className="card">Not found.</div>

  const users = usersData?.users ?? []
  const assignedIds = new Set(night.scorekeeperAssignments?.map((a: any) => a.userId) ?? [])
  const cards = cardsData?.cards ?? []
  const holes = night.holes ?? []
  const rounds = night.rounds ?? []

  // Build score set for fast lookup
  const scoreSet = new Set(
    (scoresData?.scores ?? []).map(s => `${s.playerId}::${s.holeId}::${s.roundId}::${s.position}`)
  )

  function isCardComplete(card: Card): boolean {
    if (holes.length === 0 || rounds.length === 0 || card.players.length === 0) return false
    return card.players.every(cp =>
      rounds.every(r =>
        holes.every(h =>
          scoreSet.has(`${cp.playerId}::${h.id}::${r.id}::SHORT`) &&
          scoreSet.has(`${cp.playerId}::${h.id}::${r.id}::LONG`)
        )
      )
    )
  }

  const allCardsComplete = cards.length > 0 && cards.every(isCardComplete)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link to="/admin/league-nights" className="text-sm text-brand-600 hover:underline">← All Nights</Link>
          <h1 className="text-2xl font-bold mt-1">{format(new Date(night.date), 'EEEE, MMMM d, yyyy h:mm a')}</h1>
          <p className="text-gray-500 text-sm">{night.season?.name}</p>
        </div>
        <StatusBadge status={night.status} />
      </div>

      {/* Status controls */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-3">Status</h2>
        <div className="flex gap-2 flex-wrap">
          {['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map(s => {
            const isCurrent = night.status === s
            const blockedComplete = s === 'COMPLETED' && !allCardsComplete && night.status !== 'COMPLETED'
            return (
              <button
                key={s}
                disabled={isCurrent || blockedComplete}
                onClick={() => statusMut.mutate(s)}
                className={isCurrent ? 'btn bg-gray-200 text-gray-500 cursor-default' : 'btn-secondary text-xs'}
                title={blockedComplete ? 'All cards must be fully scored before completing the night' : undefined}
              >
                {s.replace('_', ' ')}
              </button>
            )
          })}
        </div>
        {!allCardsComplete && night.status === 'IN_PROGRESS' && cards.length > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
            {cards.filter(c => !isCardComplete(c)).length} card{cards.filter(c => !isCardComplete(c)).length !== 1 ? 's' : ''} still need scoring before the night can be completed.
          </p>
        )}
      </div>

      {/* Quick links */}
      <div className="flex gap-3 flex-wrap">
        <Link to={`/admin/league-nights/${night.id}/checkin`} className="btn-primary">Check-In & Cards</Link>
        <Link to={`/admin/league-nights/${night.id}/payout`} className="btn-secondary">💰 Payout Calculator</Link>
        <Link to={`/scoring/${night.id}`} className="btn-secondary">Enter Scores</Link>
        <Link to={`/league-nights/${night.id}/leaderboard`} className="btn-secondary">View Leaderboard</Link>
        <a href={`/api/admin/league-nights/${night.id}/export/csv`} className="btn-secondary">Export CSV</a>
      </div>

      {/* Holes */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-3">Holes ({night.holes?.length})</h2>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {(night.holes ?? []).map(h => (
            <div key={h.id} className="bg-gray-50 rounded-lg p-2 text-center text-sm">
              <p className="font-bold text-brand-700">#{h.number}</p>
              <p className="text-xs text-gray-500">Short / Long</p>
            </div>
          ))}
        </div>
      </div>

      {/* Rounds */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-3">Rounds ({night.rounds?.length})</h2>
        <div className="flex gap-2">
          {(night.rounds ?? []).map(r => (
            <div key={r.id} className={`px-3 py-1 rounded text-sm ${r.isComplete ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
              Round {r.number} {r.isComplete ? '✓' : ''}
            </div>
          ))}
        </div>
      </div>

      {/* Cards */}
      {cards.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-3">Cards ({cards.length})</h2>
          <div className="space-y-2">
            {cards.map(card => {
              const complete = isCardComplete(card)
              return (
                <Link
                  key={card.id}
                  to={`/scoring/${night.id}?card=${card.id}`}
                  className="flex items-center gap-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-sm">{card.name}</span>
                    {card.scorekeeper && (
                      <span className="text-xs text-gray-500 ml-2">SK: {card.scorekeeper.user.name}</span>
                    )}
                    <span className="text-xs text-gray-400 ml-2">{card.players.length} players</span>
                  </div>
                  {complete ? (
                    <span className="badge bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400">
                      ✓ Complete
                    </span>
                  ) : (
                    <span className="badge bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                      In progress
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* Scorekeepers */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-3">Scorekeepers</h2>
        <div className="space-y-2 mb-4">
          {(night.scorekeeperAssignments ?? []).map((a: any) => (
            <div key={a.id} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded">
              <span className="text-sm font-medium">{a.user.name} ({a.user.email})</span>
              <button className="text-red-500 text-xs hover:underline" onClick={() => removeSkMut.mutate(a.userId)}>Remove</button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <select className="input flex-1" value={skUserId} onChange={e => setSkUserId(e.target.value)}>
            <option value="">Add scorekeeper…</option>
            {users.filter(u => !assignedIds.has(u.id)).map(u => (
              <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
            ))}
          </select>
          <button className="btn-primary" disabled={!skUserId} onClick={() => { addSkMut.mutate(skUserId); setSkUserId('') }}>
            Add
          </button>
        </div>
      </div>
    </div>
  )
}
