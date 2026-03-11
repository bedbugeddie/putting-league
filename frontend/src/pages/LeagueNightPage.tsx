import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, Link } from 'react-router-dom'
import { useState } from 'react'
import { api } from '../api/client'
import { useAuth } from '../store/auth'
import type { LeagueNight, CheckIn, Card, Division, ForumListResponse, ForumPost } from '../api/types'
import StatusBadge from '../components/ui/StatusBadge'
import Spinner from '../components/ui/Spinner'
import Avatar from '../components/ui/Avatar'
import { format, isSameDay, formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'
import clsx from 'clsx'

// ── Night Discussion ──────────────────────────────────────────────────────────

const EMOJI_MAP = { LIKE: '👍', FIRE: '🔥', LAUGH: '😂' } as const

function NightDiscussion({ nightId }: { nightId: string }) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle]       = useState('')
  const [body, setBody]         = useState('')

  const { data, isLoading } = useQuery<ForumListResponse>({
    queryKey: ['night-forum-posts', nightId],
    queryFn:  () => api.get(`/league-nights/${nightId}/forum/posts?limit=50`),
  })

  const createMut = useMutation({
    mutationFn: () =>
      api.post(`/league-nights/${nightId}/forum/posts`, { title, body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['night-forum-posts', nightId] })
      setTitle(''); setBody(''); setShowForm(false)
      toast.success('Post created!')
    },
    onError: () => toast.error('Could not create post'),
  })

  const reactionMut = useMutation({
    mutationFn: ({ postId, emoji }: { postId: string; emoji: string }) =>
      api.post(`/forum/posts/${postId}/reactions`, { emoji }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['night-forum-posts', nightId] }),
    onError: () => toast.error('Could not react'),
  })

  const posts = data?.posts ?? []

  if (isLoading) return <div className="flex justify-center py-8"><Spinner /></div>

  return (
    <div className="space-y-4">
      {/* New post button */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm(s => !s)}
          className="px-4 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition-colors"
        >
          {showForm ? 'Cancel' : '+ New Post'}
        </button>
      </div>

      {/* New post form */}
      {showForm && (
        <div className="bg-white dark:bg-forest-surface border border-gray-100 dark:border-forest-border rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Avatar name={user?.name ?? ''} avatarDataUrl={user?.avatarDataUrl} size="sm" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{user?.name}</span>
          </div>
          <input
            type="text"
            placeholder="Title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={200}
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-forest-border bg-white dark:bg-forest focus:outline-none focus:ring-2 focus:ring-brand-500 text-gray-900 dark:text-white"
          />
          <textarea
            placeholder="What's on your mind about tonight?"
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={3}
            maxLength={10_000}
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-forest-border bg-white dark:bg-forest focus:outline-none focus:ring-2 focus:ring-brand-500 text-gray-900 dark:text-white resize-none"
          />
          <div className="flex justify-end">
            <button
              onClick={() => createMut.mutate()}
              disabled={!title.trim() || !body.trim() || createMut.isPending}
              className="px-4 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              {createMut.isPending ? 'Posting…' : 'Post'}
            </button>
          </div>
        </div>
      )}

      {/* Post list */}
      {posts.length === 0 ? (
        <div className="text-center py-10 text-gray-400 dark:text-gray-500">
          <p className="text-3xl mb-2">💬</p>
          <p>No posts yet. Start the conversation!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post: ForumPost) => (
            <Link
              key={post.id}
              to={`/forum/${post.id}`}
              className="block bg-white dark:bg-forest-surface border border-gray-100 dark:border-forest-border rounded-xl p-4 hover:shadow-md dark:hover:border-brand-600 transition-all"
            >
              <div className="flex items-start gap-3">
                <Avatar name={post.author.name} avatarDataUrl={post.author.avatarDataUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-gray-900 dark:text-white leading-snug">
                    {post.title}
                  </h3>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    {post.author.name} · {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 line-clamp-2">
                    {post.body}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    {/* Quick reactions (clicking stops link propagation) */}
                    <div className="flex items-center gap-2">
                      {(['LIKE', 'FIRE', 'LAUGH'] as const).map(emoji => (
                        <button
                          key={emoji}
                          onClick={e => {
                            e.preventDefault()
                            reactionMut.mutate({ postId: post.id, emoji })
                          }}
                          className={clsx(
                            'flex items-center gap-1 text-sm px-2 py-0.5 rounded-full border transition-colors',
                            post.reactions.viewer[emoji]
                              ? 'bg-brand-100 dark:bg-brand-900 border-brand-400 dark:border-brand-500 text-brand-700 dark:text-brand-300'
                              : 'border-gray-200 dark:border-forest-border text-gray-500 dark:text-gray-400 hover:border-gray-400',
                          )}
                        >
                          <span>{EMOJI_MAP[emoji]}</span>
                          {post.reactions.counts[emoji] > 0 && (
                            <span>{post.reactions.counts[emoji]}</span>
                          )}
                        </button>
                      ))}
                    </div>
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      💬 {post._count?.comments ?? 0}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export default function LeagueNightPage() {
  const { id } = useParams<{ id: string }>()
  const { isAuthenticated, isAdmin, user } = useAuth()
  const qc = useQueryClient()

  // Tab state
  const [tab, setTab] = useState<'details' | 'discussion'>('details')

  // Division confirmation step state
  const [showDivisionStep, setShowDivisionStep] = useState(false)
  const [pendingDivisionId, setPendingDivisionId] = useState<string | null>(null)

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

  const { data: divisionsData } = useQuery<{ divisions: Division[] }>({
    queryKey: ['divisions'],
    queryFn: () => api.get('/divisions'),
    enabled: isAuthenticated,
  })
  const divisions = divisionsData?.divisions ?? []

  const checkInMut = useMutation({
    mutationFn: (divisionId: string | null) =>
      api.post(`/league-nights/${id}/checkin/me`, { divisionId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['checkins', id] })
      setShowDivisionStep(false)
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

  const shuffleMut = useMutation({
    mutationFn: (cardId: string) => api.post(`/cards/${cardId}/shuffle`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cards', id] })
      toast.success('Throw order shuffled!')
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

  // Is the league night happening today?
  const isTonight = isSameDay(new Date(night.date), new Date())

  // Start division-confirmation flow
  function handleCheckInClick() {
    const currentDivId = myCheckIn?.divisionId ?? user?.player?.division?.id ?? null
    setPendingDivisionId(currentDivId)
    setShowDivisionStep(true)
  }

  // Group checked-in players by their check-in division (not player's current division)
  const byDivision = new Map<string, { label: string; checkIns: CheckIn[] }>()
  checkIns.forEach(c => {
    const div = c.division
    const key = div?.code ?? '__none__'
    const label = div ? `${div.name} (${div.code})` : 'No Division'
    if (!byDivision.has(key)) byDivision.set(key, { label, checkIns: [] })
    byDivision.get(key)!.checkIns.push(c)
  })
  // Sort divisions alphabetically (no-division group last)
  const divisionOrder = [...byDivision.keys()].sort((a, b) => {
    if (a === '__none__') return 1
    if (b === '__none__') return -1
    return a.localeCompare(b)
  })

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold">{format(new Date(night.date), 'EEEE, MMMM d, yyyy')}</h1>
          <p className="text-gray-500 mt-1">{night.season?.name}</p>
        </div>
        <StatusBadge status={night.status} />
      </div>

      {/* ── Tab strip ── */}
      {isAuthenticated && (
        <div className="flex border-b border-gray-200 dark:border-forest-border">
          {(['details', 'discussion'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={clsx(
                'px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize',
                tab === t
                  ? 'border-brand-600 text-brand-700 dark:text-brand-300 dark:border-brand-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
              )}
            >
              {t === 'details' ? 'Night Details' : '💬 Discussion'}
            </button>
          ))}
        </div>
      )}

      {/* ── Discussion tab ── */}
      {isAuthenticated && tab === 'discussion' && id && (
        <NightDiscussion nightId={id} />
      )}

      {/* ── Details tab (default / unauthenticated) ── */}
      {(tab === 'details' || !isAuthenticated) && (<>

      {/* ── Self check-in banner ── */}
      {canCheckIn && (
        <div className={clsx(
          'rounded-xl p-4',
          iAmCheckedIn
            ? 'bg-brand-50 border border-brand-200 dark:bg-forest-mid dark:border-brand-700'
            : showDivisionStep
              ? 'bg-yellow-50 border border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800'
              : 'bg-yellow-50 border border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800'
        )}>
          {iAmCheckedIn ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-brand-800 dark:text-brand-200">✓ You're checked in!</p>
                <p className="text-sm text-brand-600 dark:text-brand-300">
                  {myCheckIn?.division
                    ? `Division: ${myCheckIn.division.name} (${myCheckIn.division.code})`
                    : "You'll appear on the leaderboard and scorecard."}
                </p>
              </div>
              <button
                onClick={() => checkOutMut.mutate()}
                disabled={checkOutMut.isPending}
                className="btn-secondary text-sm"
              >
                Cancel Check-In
              </button>
            </div>
          ) : showDivisionStep ? (
            <div className="space-y-3">
              <p className="font-semibold text-yellow-800 dark:text-yellow-200">Confirm your division for tonight</p>
              <select
                value={pendingDivisionId ?? ''}
                onChange={e => setPendingDivisionId(e.target.value || null)}
                className="w-full rounded-lg border border-yellow-300 bg-white px-3 py-2 text-sm dark:bg-gray-800 dark:border-yellow-700 dark:text-white"
              >
                <option value="">— Select a division —</option>
                {divisions.map(d => (
                  <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                ))}
              </select>
              <div className="flex gap-2">
                <button
                  onClick={() => checkInMut.mutate(pendingDivisionId)}
                  disabled={!pendingDivisionId || checkInMut.isPending}
                  className="btn-primary text-sm"
                >
                  {checkInMut.isPending ? 'Checking in…' : 'Confirm & Check In'}
                </button>
                <button
                  onClick={() => setShowDivisionStep(false)}
                  className="btn-secondary text-sm"
                >
                  Back
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-yellow-800 dark:text-yellow-200">
                  {isTonight
                    ? 'Are you playing tonight?'
                    : `Are you playing on ${format(new Date(night.date), 'EEE, MMM d')}?`}
                </p>
                <p className="text-sm text-yellow-700 dark:text-yellow-300">Check in so we know you're coming.</p>
              </div>
              <button
                onClick={handleCheckInClick}
                className="btn-primary text-sm"
              >
                Check In
              </button>
            </div>
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

      {/* ── Cards being finalized placeholder (non-admin, checked in, cards not published) ── */}
      {iAmCheckedIn && !isAdmin && !night.cardsPublished && night.status === 'IN_PROGRESS' && (
        <div className="card text-center py-6">
          <p className="text-3xl mb-2">🃏</p>
          <p className="font-semibold text-gray-700 dark:text-gray-200">Cards are being finalized</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Your card assignment will appear here once the admin publishes the cards.
          </p>
        </div>
      )}

      {/* ── My Card ── */}
      {myCard && (isAdmin || night.cardsPublished) && (
        <div className="card">
          {/* Admin-only unpublished warning */}
          {isAdmin && !night.cardsPublished && (
            <div className="mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-400">
              ⚠️ Cards not yet published — only admins can see this
            </div>
          )}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Your Card — {myCard.name}</h2>
            <span className="text-xs text-gray-500 dark:text-gray-400">Starts at Hole #{myCard.startingHole}</span>
          </div>

          {/* Scorekeeper status */}
          {iAmScorekeeper ? (
            <div className="mb-3 px-3 py-2 bg-brand-50 border border-brand-200 rounded-lg dark:bg-forest-mid dark:border-brand-700">
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

          {/* Card players — shown in randomized throw order (sortOrder) */}
          <div className="flex flex-wrap gap-2">
            {myCard.players.map((cp, idx) => (
              <span
                key={cp.id}
                className={clsx(
                  'px-3 py-1 rounded-full text-sm font-medium',
                  cp.hasLeft
                    ? 'bg-gray-100 text-gray-400 line-through dark:bg-gray-800 dark:text-gray-600'
                    : cp.playerId === myPlayerId
                      ? 'bg-brand-100 text-brand-800 dark:bg-forest-mid dark:text-brand-100'
                      : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                )}
              >
                <span className="text-xs opacity-50 mr-1">{idx + 1}.</span>
                {cp.player.user.name}
                {cp.hasLeft
                  ? <span className="ml-1 text-xs no-underline">🚶</span>
                  : cp.playerId === myCard.scorekeeperId && (
                    <span className="ml-1 text-xs opacity-70">📋</span>
                  )
                }
              </span>
            ))}
          </div>
          {/* Shuffle throw order — only available while the night is active */}
          {(night.status === 'SCHEDULED' || night.status === 'IN_PROGRESS') && (
            <div className="mt-3 flex justify-end">
              <button
                onClick={() => shuffleMut.mutate(myCard.id)}
                disabled={shuffleMut.isPending}
                className="btn-secondary text-xs py-1.5 px-3"
              >
                {shuffleMut.isPending ? 'Shuffling…' : '🔀 Shuffle Order'}
              </button>
            </div>
          )}
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

      {/* Who's checked in — grouped by division */}
      {checkIns.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">This Week's Players ({checkIns.length})</h2>
          <div className="space-y-5">
            {divisionOrder.map(key => {
              const group = byDivision.get(key)!
              return (
                <div key={key}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">
                    {group.label}
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700">
                          <th className="text-left pb-2 font-medium text-gray-500 text-xs">Player</th>
                          <th className="text-right pb-2 font-medium text-gray-500 text-xs">Avg</th>
                          <th className="text-right pb-2 font-medium text-gray-500 text-xs">Last</th>
                          <th className="text-right pb-2 font-medium text-gray-500 text-xs">Events</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.checkIns.map(c => (
                          <tr
                            key={c.id}
                            className={clsx(
                              'border-b border-gray-100 dark:border-gray-800 last:border-0',
                              c.playerId === myPlayerId && 'bg-brand-50/50 dark:bg-forest-mid/30'
                            )}
                          >
                            <td className="py-2 font-medium">
                              {c.player.user.name}
                              {c.playerId === myPlayerId && (
                                <span className="ml-1.5 text-xs text-brand-600 dark:text-brand-400">(you)</span>
                              )}
                            </td>
                            <td className="py-2 text-right text-gray-600 dark:text-gray-400">
                              {c.stats?.avgNightScore != null ? c.stats.avgNightScore : '—'}
                            </td>
                            <td className="py-2 text-right text-gray-600 dark:text-gray-400">
                              {c.stats?.prevNightScore != null ? c.stats.prevNightScore : '—'}
                            </td>
                            <td className="py-2 text-right text-gray-500">
                              {c.stats?.totalCheckIns ?? '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {night.notes && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-2">Notes</h2>
          <p className="text-gray-700 dark:text-gray-300 whitespace-pre-line">{night.notes}</p>
        </div>
      )}

      </>)}
    </div>
  )
}
