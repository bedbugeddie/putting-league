import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, Link } from 'react-router-dom'
import { api } from '../../api/client'
import type { CheckIn, Card, Division, Player, LeagueNight, AppSettings } from '../../api/types'
import Spinner from '../../components/ui/Spinner'
import toast from 'react-hot-toast'
import clsx from 'clsx'

export default function AdminCheckInPage() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const [minPlayersPerCard, setMinPlayersPerCard] = useState(3)
  const [shuffle, setShuffle] = useState(true)
  const [showUnpaidOnly, setShowUnpaidOnly] = useState(false)
  const [sortBy, setSortBy] = useState<'first' | 'last'>('first')
  const [groupByDivision, setGroupByDivision] = useState(true)

  const { data: nightData } = useQuery<{ leagueNight: LeagueNight }>({
    queryKey: ['league-night', id],
    queryFn: () => api.get(`/league-nights/${id}`),
    enabled: !!id,
  })

  const { data: allPlayersData, isLoading: playersLoading } = useQuery<{ players: Player[] }>({
    queryKey: ['admin-players'],
    queryFn: () => api.get('/admin/players?active=true'),
  })

  const { data: checkInsData, isLoading: checkInsLoading } = useQuery<{ checkIns: CheckIn[] }>({
    queryKey: ['checkins', id],
    queryFn: () => api.get(`/league-nights/${id}/checkins`),
    enabled: !!id,
    refetchInterval: 5000,
  })

  const { data: cardsData, isLoading: cardsLoading } = useQuery<{ cards: Card[] }>({
    queryKey: ['cards', id],
    queryFn: () => api.get(`/league-nights/${id}/cards`),
    enabled: !!id,
  })

  const { data: settingsData } = useQuery<{ settings: AppSettings }>({
    queryKey: ['admin-settings'],
    queryFn: () => api.get('/admin/settings'),
  })

  const { data: divisionsData } = useQuery<{ divisions: Division[] }>({
    queryKey: ['admin-divisions'],
    queryFn: () => api.get('/admin/divisions'),
  })

  const checkInMut = useMutation({
    mutationFn: (playerId: string) =>
      api.post(`/league-nights/${id}/checkins`, { playerId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['checkins', id] })
      qc.invalidateQueries({ queryKey: ['cards', id] })
    },
    onError: (e: any) => toast.error(e.message),
  })

  const checkOutMut = useMutation({
    mutationFn: (playerId: string) =>
      api.delete(`/league-nights/${id}/checkins/${playerId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['checkins', id] })
      qc.invalidateQueries({ queryKey: ['cards', id] })
    },
    onError: (e: any) => toast.error(e.message),
  })

  const paymentMut = useMutation({
    mutationFn: ({ playerId, hasPaid }: { playerId: string; hasPaid: boolean }) =>
      api.patch(`/league-nights/${id}/checkins/${playerId}`, { hasPaid }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['checkins', id] }),
    onError: (e: any) => toast.error(e.message),
  })

  const generateMut = useMutation({
    mutationFn: () =>
      api.post(`/league-nights/${id}/cards/generate`, { minPlayersPerCard, shuffle }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cards', id] })
      toast.success('Cards generated!')
    },
    onError: (e: any) => toast.error(e.message),
  })

  const deleteCardMut = useMutation({
    mutationFn: (cardId: string) => api.delete(`/cards/${cardId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cards', id] }),
    onError: (e: any) => toast.error(e.message),
  })

  const addToCardMut = useMutation({
    mutationFn: ({ cardId, playerId }: { cardId: string; playerId: string }) =>
      api.post(`/cards/${cardId}/players`, { playerId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cards', id] })
      toast.success('Player added to card!')
    },
    onError: (e: any) => toast.error(e.message),
  })

  const removePlayerMut = useMutation({
    mutationFn: ({ cardId, playerId }: { cardId: string; playerId: string }) =>
      api.delete(`/cards/${cardId}/players/${playerId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cards', id] }),
  })

  const movePlayerMut = useMutation({
    mutationFn: async ({ playerId, fromCardId, toCardId }: { playerId: string; fromCardId: string; toCardId: string }) => {
      await api.delete(`/cards/${fromCardId}/players/${playerId}`)
      await api.post(`/cards/${toCardId}/players`, { playerId })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cards', id] }); toast.success('Player moved') },
    onError: (e: any) => toast.error(e.message),
  })

  const assignScorekeeperMut = useMutation({
    mutationFn: ({ cardId, scorekeeperId }: { cardId: string; scorekeeperId: string | null }) =>
      api.patch(`/cards/${cardId}`, { scorekeeperId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cards', id] }),
    onError: (e: any) => toast.error(e.message),
  })

  const randomScorekeeperMut = useMutation({
    mutationFn: (cardId: string) => api.post(`/cards/${cardId}/random-scorekeeper`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cards', id] }); toast.success('Scorekeeper randomly assigned!') },
    onError: (e: any) => toast.error(e.message),
  })

  const changeDivisionMut = useMutation({
    mutationFn: ({ playerId, divisionId }: { playerId: string; divisionId: string | null }) =>
      api.patch(`/league-nights/${id}/checkins/${playerId}`, { divisionId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cards', id] })
      qc.invalidateQueries({ queryKey: ['admin-players'] })
      qc.invalidateQueries({ queryKey: ['checkins', id] })
      toast.success('Division updated!')
    },
    onError: (e: any) => toast.error(e.message),
  })

  const isLoading = playersLoading || checkInsLoading || cardsLoading
  if (isLoading) return <div className="flex justify-center py-20"><Spinner className="h-10 w-10" /></div>

  const allPlayers = allPlayersData?.players ?? []
  const checkIns = checkInsData?.checkIns ?? []
  const cards = cardsData?.cards ?? []
  const allDivisions = (divisionsData?.divisions ?? []).filter(d => d.isActive).sort((a, b) => a.sortOrder - b.sortOrder)
  const checkedInMap = new Map(checkIns.map(c => [c.playerId, c]))

  // Players who are checked in but not assigned to any card yet (latecomers)
  // Exclude hasLeft:true — those players left early and should still be addable to other cards
  const assignedPlayerIds = new Set(cards.flatMap(c => c.players.filter(cp => !cp.hasLeft).map(cp => cp.playerId)))
  const uncardedCheckIns = checkIns.filter(ci => !assignedPlayerIds.has(ci.playerId))

  const totalHoles = nightData?.leagueNight?.holes?.length ?? 1
  const N = checkIns.length
  const previewCardCount = N === 0 ? 0
    : N < minPlayersPerCard ? 1
    : Math.min(Math.floor(N / minPlayersPerCard), totalHoles)

  const housePerEntry = settingsData?.settings.housePerEntry ?? 1
  const eoyPerEntry   = settingsData?.settings.eoyPerEntry   ?? 2
  const paidCount   = checkIns.filter(c => c.hasPaid).length
  const totalGross  = checkIns.reduce((sum, c) => c.hasPaid ? sum + (c.player.division?.entryFee ?? 0) : sum, 0)
  const totalHouse  = paidCount * housePerEntry
  const totalEoy    = paidCount * eoyPerEntry
  const totalPool   = Math.max(0, totalGross - totalHouse - totalEoy)

  // Sort all players by first or last name
  function getLastName(user: { name: string; lastName?: string | null }) {
    if (user.lastName) return user.lastName
    // Fallback for legacy records without a stored lastName
    const parts = user.name.trim().split(/\s+/)
    return parts.length > 1 ? parts[parts.length - 1] : user.name
  }
  function displayName(user: { name: string; firstName?: string | null; lastName?: string | null }) {
    if (sortBy !== 'last') return user.name
    if (user.lastName && user.firstName) return `${user.lastName}, ${user.firstName}`
    // Fallback for legacy records
    const parts = user.name.trim().split(/\s+/)
    if (parts.length < 2) return user.name
    const last = parts[parts.length - 1]
    const first = parts.slice(0, parts.length - 1).join(' ')
    return `${last}, ${first}`
  }
  const sortedPlayers = [...allPlayers].sort((a, b) => {
    const ka = sortBy === 'last'
      ? getLastName(a.user).toLowerCase() + ' ' + a.user.name.toLowerCase()
      : a.user.name.toLowerCase()
    const kb = sortBy === 'last'
      ? getLastName(b.user).toLowerCase() + ' ' + b.user.name.toLowerCase()
      : b.user.name.toLowerCase()
    return ka.localeCompare(kb)
  })

  // Group by division for the check-in list
  const byDivision = new Map<string, Player[]>()
  for (const p of sortedPlayers) {
    const key = p.division?.code ?? '(No Division)'
    if (!byDivision.has(key)) byDivision.set(key, [])
    byDivision.get(key)!.push(p)
  }
  const divisions = Array.from(byDivision.entries()).sort((a, b) => a[0].localeCompare(b[0]))

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <Link to={`/admin/league-nights/${id}`} className="text-sm text-brand-600 hover:underline">← Night Details</Link>
        <h1 className="text-xl sm:text-2xl font-bold">Check-In & Cards</h1>
        <span className="badge bg-brand-100 text-brand-800">{checkIns.length} checked in</span>
        {paidCount > 0 && (
          <span className="badge bg-green-100 text-green-800">
            {paidCount} paid · ${totalGross} gross · ${totalHouse} house · ${totalEoy} EOY · ${totalPool} pool
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* ── Left: Check-in list ── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Player Check-In</h2>
            <Link
              to={`/admin/league-nights/${id}/payout`}
              className="btn-secondary text-xs px-3 py-1.5"
            >
              💰 Payout Calculator
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-gray-500 flex-1 min-w-[160px]">Toggle players present tonight. Use $ to mark entry fee payment.</p>
            {/* Sort controls */}
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-xs text-gray-400 mr-0.5">Sort:</span>
              {(['first', 'last'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setSortBy(s)}
                  className={clsx(
                    'text-xs px-2.5 py-1.5 rounded-lg border transition-colors',
                    sortBy === s
                      ? 'bg-brand-100 border-brand-400 text-brand-800 dark:bg-brand-600 dark:border-brand-500 dark:text-white'
                      : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300 dark:hover:border-gray-500'
                  )}
                >
                  {s === 'first' ? 'First' : 'Last'}
                </button>
              ))}
            </div>
            {/* Group by division toggle */}
            <button
              onClick={() => setGroupByDivision(v => !v)}
              className={clsx(
                'text-xs px-3 py-1.5 rounded-lg border transition-colors shrink-0',
                groupByDivision
                  ? 'bg-brand-100 border-brand-400 text-brand-800 dark:bg-brand-600 dark:border-brand-500 dark:text-white'
                  : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300 dark:hover:border-gray-500'
              )}
            >
              {groupByDivision ? 'By Division ✓' : 'By Division'}
            </button>
            {/* Unpaid only toggle */}
            <button
              onClick={() => setShowUnpaidOnly(v => !v)}
              className={clsx(
                'text-xs px-3 py-1.5 rounded-lg border transition-colors shrink-0',
                showUnpaidOnly
                  ? 'bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-300'
                  : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-400'
              )}
            >
              {showUnpaidOnly ? '$ Unpaid only ✓' : '$ Unpaid only'}
            </button>
          </div>

          {groupByDivision ? (
            divisions.map(([divCode, players]) => {
              const divCheckIns = players.filter(p => checkedInMap.has(p.id))
              const divPaid = divCheckIns.filter(p => checkedInMap.get(p.id)?.hasPaid).length
              const entryFee = players[0]?.division?.entryFee ?? 0
              // When filtering, only show players who are checked-in and haven't paid
              const visiblePlayers = showUnpaidOnly
                ? players.filter(p => checkedInMap.has(p.id) && !checkedInMap.get(p.id)?.hasPaid)
                : players
              if (showUnpaidOnly && visiblePlayers.length === 0) return null
              return (
                <div key={divCode} className="card">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-500">
                      {divCode}{players[0]?.division?.name ? ` — ${players[0].division.name}` : ''}
                    </h3>
                    {divCheckIns.length > 0 && (
                      <span className="text-xs text-gray-400">
                        {divPaid}/{divCheckIns.length} paid · ${(divPaid * entryFee).toFixed(0)} pool
                      </span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {visiblePlayers.map(p => {
                      const checkIn = checkedInMap.get(p.id)
                      const isIn = !!checkIn
                      const hasPaid = checkIn?.hasPaid ?? false
                      return (
                        <div key={p.id} className="flex items-center gap-2">
                          {/* Check-in toggle */}
                          <button
                            onClick={() => isIn ? checkOutMut.mutate(p.id) : checkInMut.mutate(p.id)}
                            className={clsx(
                              'flex-1 flex items-center justify-between px-4 py-3 rounded-lg border text-sm transition-colors min-h-[48px]',
                              isIn
                                ? 'bg-brand-100 border-brand-400 text-brand-900 dark:bg-forest-mid dark:border-brand-700 dark:text-brand-100'
                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 dark:bg-forest-surface dark:border-forest-border dark:text-brand-200 dark:hover:bg-forest-mid'
                            )}
                          >
                            <span className="font-medium">{displayName(p.user)}</span>
                            <span className={clsx('text-sm font-bold', isIn ? 'text-brand-800 dark:text-brand-300' : 'text-gray-400')}>
                              {isIn ? '✓ In' : 'Out'}
                            </span>
                          </button>

                          {/* Division selector */}
                          {isIn && (
                            <select
                              value={checkIn?.divisionId ?? ''}
                              onChange={e => changeDivisionMut.mutate({ playerId: p.id, divisionId: e.target.value || null })}
                              title="Change division"
                              className={clsx(
                                'shrink-0 h-12 px-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors',
                                checkIn?.divisionId
                                  ? 'bg-brand-50 border-brand-300 text-brand-700 dark:bg-brand-800 dark:border-brand-600 dark:text-brand-100'
                                  : 'bg-white border-gray-200 text-gray-400 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-500'
                              )}
                            >
                              <option value="">— div —</option>
                              {allDivisions.map(d => (
                                <option key={d.id} value={d.id}>{d.code}</option>
                              ))}
                            </select>
                          )}

                          {/* Card selector */}
                          {isIn && cards.length > 0 && (() => {
                            const currentCard = cards.find(c => c.players.some(cp => cp.playerId === p.id && !cp.hasLeft))
                            return (
                              <select
                                value={currentCard?.id ?? ''}
                                onChange={e => {
                                  const toCardId = e.target.value
                                  if (!toCardId || toCardId === currentCard?.id) return
                                  if (currentCard) {
                                    movePlayerMut.mutate({ playerId: p.id, fromCardId: currentCard.id, toCardId })
                                  } else {
                                    addToCardMut.mutate({ cardId: toCardId, playerId: p.id })
                                  }
                                }}
                                title="Change card"
                                className={clsx(
                                  'shrink-0 h-12 px-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors',
                                  currentCard
                                    ? 'bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-800 dark:border-amber-600 dark:text-amber-100'
                                    : 'bg-white border-dashed border-gray-300 text-gray-400 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-500'
                                )}
                              >
                                <option value="">— card —</option>
                                {cards.map(c => (
                                  <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                              </select>
                            )
                          })()}

                          {/* Payment toggle — only visible when checked in */}
                          {isIn && (
                            <button
                              onClick={() => paymentMut.mutate({ playerId: p.id, hasPaid: !hasPaid })}
                              title={hasPaid ? 'Mark as unpaid' : 'Mark as paid'}
                              className={clsx(
                                'shrink-0 px-3 py-3 rounded-lg border text-sm font-semibold transition-colors min-h-[48px]',
                                hasPaid
                                  ? 'bg-green-50 border-green-300 text-green-700 dark:bg-green-900/30 dark:border-green-700 dark:text-green-300'
                                  : 'bg-white border-gray-200 text-gray-400 hover:border-green-300 hover:text-green-600 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-500'
                              )}
                            >
                              {hasPaid ? '$ ✓' : '$'}
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })
          ) : (
            /* Flat list — all players sorted, division badge shown inline */
            (() => {
              const flatPlayers = sortedPlayers.filter(p =>
                showUnpaidOnly
                  ? checkedInMap.has(p.id) && !checkedInMap.get(p.id)?.hasPaid
                  : true
              )
              if (flatPlayers.length === 0) {
                return (
                  <div className="card text-center py-6 text-gray-400 text-sm italic">
                    No players to show.
                  </div>
                )
              }
              return (
                <div className="card">
                  <div className="space-y-2">
                    {flatPlayers.map(p => {
                      const checkIn = checkedInMap.get(p.id)
                      const isIn = !!checkIn
                      const hasPaid = checkIn?.hasPaid ?? false
                      return (
                        <div key={p.id} className="flex items-center gap-2">
                          <button
                            onClick={() => isIn ? checkOutMut.mutate(p.id) : checkInMut.mutate(p.id)}
                            className={clsx(
                              'flex-1 flex items-center justify-between px-4 py-3 rounded-lg border text-sm transition-colors min-h-[48px]',
                              isIn
                                ? 'bg-brand-100 border-brand-400 text-brand-900 dark:bg-forest-mid dark:border-brand-700 dark:text-brand-100'
                                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 dark:bg-forest-surface dark:border-forest-border dark:text-brand-200 dark:hover:bg-forest-mid'
                            )}
                          >
                            <span className="flex items-center gap-1.5">
                              <span className="font-medium">{displayName(p.user)}</span>
                              {p.division?.code && (
                                <span className={clsx(
                                  'text-xs font-mono',
                                  isIn ? 'text-brand-600 dark:text-brand-400' : 'text-gray-400'
                                )}>
                                  {p.division.code}
                                </span>
                              )}
                            </span>
                            <span className={clsx('text-sm font-bold', isIn ? 'text-brand-800 dark:text-brand-300' : 'text-gray-400')}>
                              {isIn ? '✓ In' : 'Out'}
                            </span>
                          </button>
                          {/* Division selector */}
                          {isIn && (
                            <select
                              value={checkIn?.divisionId ?? ''}
                              onChange={e => changeDivisionMut.mutate({ playerId: p.id, divisionId: e.target.value || null })}
                              title="Change division"
                              className={clsx(
                                'shrink-0 h-12 px-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors',
                                checkIn?.divisionId
                                  ? 'bg-brand-50 border-brand-300 text-brand-700 dark:bg-brand-800 dark:border-brand-600 dark:text-brand-100'
                                  : 'bg-white border-gray-200 text-gray-400 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-500'
                              )}
                            >
                              <option value="">— div —</option>
                              {allDivisions.map(d => (
                                <option key={d.id} value={d.id}>{d.code}</option>
                              ))}
                            </select>
                          )}

                          {/* Card selector */}
                          {isIn && cards.length > 0 && (() => {
                            const currentCard = cards.find(c => c.players.some(cp => cp.playerId === p.id && !cp.hasLeft))
                            return (
                              <select
                                value={currentCard?.id ?? ''}
                                onChange={e => {
                                  const toCardId = e.target.value
                                  if (!toCardId || toCardId === currentCard?.id) return
                                  if (currentCard) {
                                    movePlayerMut.mutate({ playerId: p.id, fromCardId: currentCard.id, toCardId })
                                  } else {
                                    addToCardMut.mutate({ cardId: toCardId, playerId: p.id })
                                  }
                                }}
                                title="Change card"
                                className={clsx(
                                  'shrink-0 h-12 px-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors',
                                  currentCard
                                    ? 'bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-800 dark:border-amber-600 dark:text-amber-100'
                                    : 'bg-white border-dashed border-gray-300 text-gray-400 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-500'
                                )}
                              >
                                <option value="">— card —</option>
                                {cards.map(c => (
                                  <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                              </select>
                            )
                          })()}

                          {isIn && (
                            <button
                              onClick={() => paymentMut.mutate({ playerId: p.id, hasPaid: !hasPaid })}
                              title={hasPaid ? 'Mark as unpaid' : 'Mark as paid'}
                              className={clsx(
                                'shrink-0 px-3 py-3 rounded-lg border text-sm font-semibold transition-colors min-h-[48px]',
                                hasPaid
                                  ? 'bg-green-50 border-green-300 text-green-700 dark:bg-green-900/30 dark:border-green-700 dark:text-green-300'
                                  : 'bg-white border-gray-200 text-gray-400 hover:border-green-300 hover:text-green-600 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-500'
                              )}
                            >
                              {hasPaid ? '$ ✓' : '$'}
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()
          )}
        </div>

        {/* ── Right: Card management ── */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Cards</h2>

          {/* Auto-generate controls */}
          <div className="card space-y-3">
            <p className="text-sm font-medium text-gray-700">Auto-Generate Cards</p>
            <p className="text-xs text-gray-500">
              Creates cards from all {checkIns.length} checked-in players. Replaces any existing cards.
            </p>
            <div className="flex items-center gap-4">
              <div>
                <label className="label text-xs">Min. players per card</label>
                <input
                  type="number"
                  min={1}
                  value={minPlayersPerCard}
                  onChange={e => setMinPlayersPerCard(Math.max(1, Number(e.target.value)))}
                  className="input w-20"
                />
              </div>
              <div className="flex items-center gap-2 mt-4">
                <input
                  type="checkbox"
                  id="shuffle"
                  checked={shuffle}
                  onChange={e => setShuffle(e.target.checked)}
                />
                <label htmlFor="shuffle" className="text-sm text-gray-600">Shuffle players</label>
              </div>
            </div>
            <button
              className="btn-primary w-full"
              onClick={() => generateMut.mutate()}
              disabled={checkIns.length === 0 || generateMut.isPending}
            >
              {generateMut.isPending ? 'Generating…' : `Generate ${previewCardCount} ${previewCardCount === 1 ? 'Card' : 'Cards'}`}
            </button>
          </div>

          {/* Card list */}
          {cards.length === 0 ? (
            <div className="card text-center text-gray-400 py-8">
              No cards yet. Check in players and generate cards above.
            </div>
          ) : (
            <div className="space-y-3">
              {/* Unassigned players — checked in but not on any card */}
              {uncardedCheckIns.length > 0 && (
                <div className="card border-2 border-dashed border-amber-300 dark:border-amber-700">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-amber-500">⚠️</span>
                    <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                      Not on a card yet
                    </p>
                  </div>
                  <div className="space-y-2">
                    {uncardedCheckIns.map(ci => (
                      <div key={ci.playerId} className="flex items-center gap-2">
                        <span className="flex-1 text-sm font-medium">
                          {ci.player.user.name}
                          {ci.player.division?.code && (
                            <span className="text-xs text-gray-400 ml-1.5">{ci.player.division.code}</span>
                          )}
                        </span>
                        <select
                          className="text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-700 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
                          defaultValue=""
                          onChange={e => {
                            if (e.target.value) {
                              addToCardMut.mutate({ cardId: e.target.value, playerId: ci.playerId })
                              e.target.value = ''
                            }
                          }}
                        >
                          <option value="">Add to card…</option>
                          {cards.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {cards.map(card => {
                // Admin display order: scorekeeper pinned first, rest sorted alphabetically by last name
                const displayPlayers = [...card.players].sort((a, b) => {
                  const aIsKeeper = a.playerId === card.scorekeeperId
                  const bIsKeeper = b.playerId === card.scorekeeperId
                  if (aIsKeeper !== bIsKeeper) return aIsKeeper ? -1 : 1
                  const aKey = ((a.player.user.lastName ?? '') || (a.player.user.name.trim().split(/\s+/).at(-1) ?? '')).toLowerCase()
                    + ',' + ((a.player.user.firstName ?? '') || (a.player.user.name.trim().split(/\s+/)[0] ?? '')).toLowerCase()
                  const bKey = ((b.player.user.lastName ?? '') || (b.player.user.name.trim().split(/\s+/).at(-1) ?? '')).toLowerCase()
                    + ',' + ((b.player.user.firstName ?? '') || (b.player.user.name.trim().split(/\s+/)[0] ?? '')).toLowerCase()
                  return aKey.localeCompare(bKey)
                })
                return (
                <div key={card.id} className="card">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-semibold">{card.name}</p>
                      <p className="text-xs text-gray-500">
                        Starts at Hole #{card.startingHole} · {card.players.length} {card.players.length === 1 ? 'player' : 'players'}
                      </p>
                    </div>
                    <button
                      onClick={() => { if (confirm(`Delete ${card.name}?`)) deleteCardMut.mutate(card.id) }}
                      className="text-red-400 hover:text-red-600 text-xs"
                    >
                      Delete
                    </button>
                  </div>
                  {/* Scorekeeper assignment */}
                  <div className="mb-3 pb-3 border-b border-gray-100 dark:border-gray-700">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Scorekeeper</p>
                    {card.scorekeeper ? (
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-brand-700 dark:text-brand-300">
                          📋 {card.scorekeeper.user.name}
                        </span>
                        <button
                          onClick={() => assignScorekeeperMut.mutate({ cardId: card.id, scorekeeperId: null })}
                          className="text-xs text-gray-400 hover:text-red-400"
                        >
                          Clear
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <select
                          className="text-xs border border-gray-200 rounded px-2 py-1 flex-1 bg-white text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                          defaultValue=""
                          onChange={e => { if (e.target.value) assignScorekeeperMut.mutate({ cardId: card.id, scorekeeperId: e.target.value }) }}
                        >
                          <option value="">Assign scorekeeper…</option>
                          {displayPlayers.map(cp => (
                            <option key={cp.player.id} value={cp.player.id}>{cp.player.user.name}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => randomScorekeeperMut.mutate(card.id)}
                          className="text-xs btn-secondary py-1 px-2 shrink-0"
                          title="Pick randomly"
                        >
                          🎲 Random
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Players list */}
                  <div className="space-y-1">
                    {displayPlayers.map(cp => {
                      const checkIn = checkedInMap.get(cp.player.id)
                      return (
                        <div key={cp.id} className={clsx(
                          'flex items-center justify-between text-sm px-3 py-1.5 rounded',
                          cp.hasLeft
                            ? 'bg-gray-100 dark:bg-gray-800/60 opacity-60'
                            : 'bg-gray-50 dark:bg-gray-700/50'
                        )}>
                          <span className={clsx(
                            cp.player.id === card.scorekeeperId ? 'font-medium text-brand-700 dark:text-brand-300' : '',
                            cp.hasLeft && 'line-through text-gray-400 dark:text-gray-500'
                          )}>
                            {cp.player.user.name}
                            {cp.hasLeft && <span className="ml-1.5 text-xs no-underline not-italic font-medium text-orange-500 dark:text-orange-400">(left)</span>}
                          </span>
                          <div className="flex items-center gap-2">
                            {checkIn?.hasPaid && (
                              <span className="text-xs text-green-600 font-semibold">$</span>
                            )}
                            <select
                              className="text-xs border border-gray-200 rounded px-1 py-0.5 bg-white text-gray-700 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
                              value={cp.player.divisionId ?? ''}
                              onChange={e => changeDivisionMut.mutate({
                                playerId: cp.player.id,
                                divisionId: e.target.value || null,
                              })}
                            >
                              <option value="">— No div —</option>
                              {allDivisions.map(d => (
                                <option key={d.id} value={d.id}>{d.code}</option>
                              ))}
                            </select>
                            {cards.length > 1 && (
                              <select
                                className="text-xs border border-gray-200 rounded px-1 py-0.5 bg-white text-gray-700 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
                                defaultValue=""
                                onChange={e => {
                                  if (e.target.value) movePlayerMut.mutate({ playerId: cp.player.id, fromCardId: card.id, toCardId: e.target.value })
                                }}
                              >
                                <option value="">Move →</option>
                                {cards.filter(c => c.id !== card.id).map(c => (
                                  <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                              </select>
                            )}
                            <button
                              onClick={() => removePlayerMut.mutate({ cardId: card.id, playerId: cp.player.id })}
                              className="text-gray-300 hover:text-red-400 text-xs"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      )
                    })}

                    {/* Add any paid checked-in player not yet on this card */}
                    {(() => {
                      const cardPlayerIds = new Set(card.players.map(cp => cp.playerId))
                      const addable = checkIns.filter(ci =>
                        !assignedPlayerIds.has(ci.playerId) &&
                        !cardPlayerIds.has(ci.playerId)
                      )
                      if (addable.length === 0) return null
                      return (
                        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                          <select
                            className="text-xs border border-dashed border-gray-300 rounded px-2 py-1 flex-1 bg-white text-gray-700 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
                            defaultValue=""
                            onChange={e => {
                              if (e.target.value) {
                                addToCardMut.mutate({ cardId: card.id, playerId: e.target.value })
                                e.target.value = ''
                              }
                            }}
                          >
                            <option value="">+ Add player…</option>
                            {addable.map(ci => (
                              <option key={ci.playerId} value={ci.playerId}>
                                {ci.player.user.name}{ci.player.division?.code ? ` (${ci.player.division.code})` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      )
                    })()}
                  </div>
                </div>
              )})}

            </div>
          )}
        </div>
      </div>
    </div>
  )
}
