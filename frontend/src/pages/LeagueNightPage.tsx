import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../store/auth'
import type { LeagueNight, CheckIn, Card } from '../api/types'
import StatusBadge from '../components/ui/StatusBadge'
import Spinner from '../components/ui/Spinner'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import clsx from 'clsx'

export default function LeagueNightPage() {
  const { id } = useParams<{ id: string }>()
  const { isAuthenticated, isAdmin, user } = useAuth()
  const qc = useQueryClient()

  const { data, isLoading } = useQuery<{ leagueNight: LeagueNight }>({
    queryKey: ['league-night', id],
    queryFn: () => api.get(`/league-nights/${id}`),
    enabled: !!id,
  })

  const { data: checkInsData } = useQuery<{ checkIns: CheckIn[] }>({
    queryKey: ['checkins', id],
    queryFn: () => api.get(`/league-nights/${id}/checkins`),
    enabled: !!id,
    refetchInterval: 5000,
  })

  const checkInMut = useMutation({
    mutationFn: () => api.post(`/league-nights/${id}/checkin/me`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['checkins', id] })
      toast.success("You're checked in!")
    },
    onError: (e: any) => toast.error(e.message),
  })

  const checkOutMut = useMutation({
    mutationFn: () => api.delete(`/league-nights/${id}/checkin/me`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['checkins', id] })
      toast.success('Checked out.')
    },
    onError: (e: any) => toast.error(e.message),
  })

  const { data: cardsData } = useQuery<{ cards: Card[] }>({
    queryKey: ['cards', id],
    queryFn: () => api.get(`/league-nights/${id}/cards`),
    enabled: !!id,
    refetchInterval: 5000,
  })

  const volunteerMut = useMutation({
    mutationFn: (cardId: string) => api.post(`/cards/${cardId}/volunteer`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cards', id] })
      toast.success("You're the scorekeeper for your card!")
    },
    onError: (e: any) => toast.error(e.message),
  })

  const randomScorekeeperMut = useMutation({
    mutationFn: (cardId: string) => api.post(`/cards/${cardId}/random-scorekeeper`, {}),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['cards', id] })
      toast.success(`${data.card.scorekeeper.user.name} was randomly selected as scorekeeper!`)
    },
    onError: (e: any) => toast.error(e.message),
  })

  const stepDownMut = useMutation({
    mutationFn: (cardId: string) => api.delete(`/cards/${cardId}/scorekeeper`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cards', id] })
      toast.success('Stepped down as scorekeeper.')
    },
    onError: (e: any) => toast.error(e.message),
  })

  if (isLoading) return <div className="flex justify-center py-20"><Spinner className="h-10 w-10" /></div>

  const night = data?.leagueNight
  if (!night) return <div className="card">League night not found.</div>

  const checkIns = checkInsData?.checkIns ?? []
  // Derive player ID from check-ins list first (handles stale localStorage where player is null),
  // then fall back to stored user profile.
  const myCheckIn = isAuthenticated ? checkIns.find(c => c.player.userId === user?.id) : null
  const myPlayerId = myCheckIn?.playerId ?? user?.player?.id
  const iAmCheckedIn = !!myCheckIn
  const canCheckIn = isAuthenticated &&
    (night.status === 'SCHEDULED' || night.status === 'IN_PROGRESS')

  const cards = cardsData?.cards ?? []
  const myCard = myPlayerId ? cards.find(c => c.players.some(cp => cp.playerId === myPlayerId)) : null
  const iAmScorekeeper = myCard?.scorekeeperId === myPlayerId

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold">{format(new Date(night.date), 'EEEE, MMMM d, yyyy')}</h1>
          <p className="text-gray-500 mt-1">{night.season?.name}</p>
        </div>
        <StatusBadge status={night.status} />
      </div>

      {/* ── Self check-in banner ── */}
      {canCheckIn && (
        <div className={clsx(
          'rounded-xl p-4 flex items-center justify-between',
          iAmCheckedIn
            ? 'bg-brand-50 border border-brand-200 dark:bg-brand-900/30 dark:border-brand-800'
            : 'bg-yellow-50 border border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800'
        )}>
          <div>
            {iAmCheckedIn ? (
              <>
                <p className="font-semibold text-brand-800 dark:text-brand-200">✓ You're checked in for tonight!</p>
                <p className="text-sm text-brand-600 dark:text-brand-300">You'll appear on the leaderboard and scorecard.</p>
              </>
            ) : (
              <>
                <p className="font-semibold text-yellow-800 dark:text-yellow-200">Are you playing tonight?</p>
                <p className="text-sm text-yellow-700 dark:text-yellow-300">Check in so you appear on the scorecard.</p>
              </>
            )}
          </div>
          {iAmCheckedIn ? (
            <button
              onClick={() => checkOutMut.mutate()}
              disabled={checkOutMut.isPending}
              className="btn-secondary text-sm"
            >
              Cancel Check-In
            </button>
          ) : (
            <button
              onClick={() => checkInMut.mutate()}
              disabled={checkInMut.isPending}
              className="btn-primary text-sm"
            >
              {checkInMut.isPending ? 'Checking in…' : 'Check In'}
            </button>
          )}
        </div>
      )}

      {/* Not logged in prompt */}
      {!isAuthenticated && (night.status === 'SCHEDULED' || night.status === 'IN_PROGRESS') && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-center justify-between dark:bg-gray-800 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-300">Sign in to check yourself in for tonight.</p>
          <Link to="/login" className="btn-secondary text-sm">Sign In</Link>
        </div>
      )}

      {/* Logged in but no player profile */}
      {isAuthenticated && !myPlayerId && !iAmCheckedIn && (night.status === 'SCHEDULED' || night.status === 'IN_PROGRESS') && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 dark:bg-gray-800 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-300">Your account isn't linked to a player profile yet. Ask an admin to add you.</p>
        </div>
      )}

      {/* ── My Card ── */}
      {myCard && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Your Card — {myCard.name}</h2>
            <span className="text-xs text-gray-500 dark:text-gray-400">Starts at Hole #{myCard.startingHole}</span>
          </div>

          {/* Scorekeeper status */}
          {iAmScorekeeper ? (
            <div className="mb-3 px-3 py-2 bg-brand-50 border border-brand-200 rounded-lg dark:bg-brand-900/30 dark:border-brand-800">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-brand-800 dark:text-brand-200">📋 You're the scorekeeper for this card</p>
                  <p className="text-xs text-brand-600 dark:text-brand-300 mt-0.5">Tap to open the scorecard and enter scores.</p>
                </div>
                <Link to={`/scoring/${id}`} className="btn-primary text-sm shrink-0">
                  Enter Scores
                </Link>
              </div>
              <button
                onClick={() => stepDownMut.mutate(myCard.id)}
                disabled={stepDownMut.isPending}
                className="mt-2 text-xs text-brand-500 hover:text-brand-700 dark:text-brand-400 underline"
              >
                Step down as scorekeeper
              </button>
            </div>
          ) : myCard.scorekeeper ? (
            <div className="mb-3 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg dark:bg-gray-700/50 dark:border-gray-700">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                📋 Scorekeeper: <span className="font-semibold">{myCard.scorekeeper.user.name}</span>
              </p>
            </div>
          ) : (
            <div className="mb-3 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg dark:bg-yellow-900/20 dark:border-yellow-800">
              <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-2">No scorekeeper yet for this card.</p>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => volunteerMut.mutate(myCard.id)}
                  disabled={volunteerMut.isPending || randomScorekeeperMut.isPending}
                  className="btn-primary text-xs py-1"
                >
                  {volunteerMut.isPending ? 'Volunteering…' : 'Volunteer'}
                </button>
                <button
                  onClick={() => randomScorekeeperMut.mutate(myCard.id)}
                  disabled={volunteerMut.isPending || randomScorekeeperMut.isPending}
                  className="btn-secondary text-xs py-1"
                >
                  {randomScorekeeperMut.isPending ? 'Picking…' : '🎲 Pick Random'}
                </button>
              </div>
            </div>
          )}

          {/* Card players */}
          <div className="flex flex-wrap gap-2">
            {myCard.players.map(cp => (
              <span
                key={cp.id}
                className={clsx(
                  'px-3 py-1 rounded-full text-sm font-medium',
                  cp.playerId === myPlayerId
                    ? 'bg-brand-100 text-brand-800 dark:bg-brand-900/40 dark:text-brand-200'
                    : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                )}
              >
                {cp.player.user.name}
                {cp.playerId === myCard.scorekeeperId && (
                  <span className="ml-1 text-xs opacity-70">📋</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Action links */}
      <div className="flex flex-wrap gap-3">
        <Link to={`/league-nights/${id}/leaderboard`} className="btn-primary">
          View Leaderboard
        </Link>
        {iAmScorekeeper && night.status !== 'CANCELLED' && (
          <Link to={`/scoring/${id}`} className="btn-secondary">
            Enter Scores
          </Link>
        )}
        {isAdmin && (
          <Link to={`/admin/league-nights/${id}/checkin`} className="btn-secondary">
            Manage Check-In
          </Link>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Holes', value: night.holes?.length ?? '?' },
          { label: 'Rounds', value: night.rounds?.length ?? '?' },
          { label: 'Checked In', value: checkIns.length },
          { label: 'Tie-breaker', value: night.tieBreakerMode === 'SPLIT' ? 'Split' : 'Putt-off' },
        ].map(item => (
          <div key={item.label} className="card text-center">
            <p className="text-2xl font-bold text-brand-700">{item.value}</p>
            <p className="text-sm text-gray-500 mt-1">{item.label}</p>
          </div>
        ))}
      </div>

      {/* Who's checked in */}
      {checkIns.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-3">Tonight's Players ({checkIns.length})</h2>
          <div className="flex flex-wrap gap-2">
            {checkIns.map(c => (
              <span
                key={c.id}
                className={clsx(
                  'px-3 py-1 rounded-full text-sm font-medium',
                  c.playerId === myPlayerId
                    ? 'bg-brand-100 text-brand-800'
                    : 'bg-gray-100 text-gray-700'
                )}
              >
                {c.player.user.name}
                {c.player.division && <span className="text-xs ml-1 opacity-60">{c.player.division.code}</span>}
              </span>
            ))}
          </div>
        </div>
      )}

      {night.notes && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-2">Notes</h2>
          <p className="text-gray-700 whitespace-pre-line">{night.notes}</p>
        </div>
      )}
    </div>
  )
}
