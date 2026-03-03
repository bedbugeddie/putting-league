import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, Link } from 'react-router-dom'
import { api } from '../../api/client'
import type { CheckIn, Card, Player, LeagueNight, AppSettings } from '../../api/types'
import Spinner from '../../components/ui/Spinner'
import toast from 'react-hot-toast'
import clsx from 'clsx'

export default function AdminCheckInPage() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const [minPlayersPerCard, setMinPlayersPerCard] = useState(3)
  const [shuffle, setShuffle] = useState(true)
  const [showUnpaidOnly, setShowUnpaidOnly] = useState(false)

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

  const checkInMut = useMutation({
    mutationFn: (playerId: string) =>
      api.post(`/league-nights/${id}/checkins`, { playerId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['checkins', id] }),
    onError: (e: any) => toast.error(e.message),
  })

  const checkOutMut = useMutation({
    mutationFn: (playerId: string) =>
      api.delete(`/league-nights/${id}/checkins/${playerId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['checkins', id] }),
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

  const isLoading = playersLoading || checkInsLoading || cardsLoading
  if (isLoading) return <div className="flex justify-center py-20"><Spinner className="h-10 w-10" /></div>

  const allPlayers = allPlayersData?.players ?? []
  const checkIns = checkInsData?.checkIns ?? []
  const cards = cardsData?.cards ?? []
  const checkedInMap = new Map(checkIns.map(c => [c.playerId, c]))

  // Players who are checked in but not assigned to any card yet (latecomers)
  const assignedPlayerIds = new Set(cards.flatMap(c => c.players.map(cp => cp.playerId)))
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

  // Group all players by division for the check-in list
  const byDivision = new Map<string, Player[]>()
  for (const p of allPlayers) {
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
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Toggle players present tonight. Use the $ button to mark entry fee payment.</p>
            <button
              onClick={() => setShowUnpaidOnly(v => !v)}
              className={clsx(
                'text-xs px-3 py-1.5 rounded-lg border transition-colors shrink-0 ml-3',
                showUnpaidOnly
                  ? 'bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-300'
                  : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-400'
              )}
            >
              {showUnpaidOnly ? '$ Unpaid only ✓' : '$ Unpaid only'}
            </button>
          </div>

          {divisions.map(([divCode, players]) => {
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
                              ? 'bg-brand-50 border-brand-300 text-brand-800 dark:bg-brand-900/30 dark:border-brand-700 dark:text-brand-200'
                              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-600'
                          )}
                        >
                          <span className="font-medium">{p.user.name}</span>
                          <span className={clsx('text-sm font-semibold', isIn ? 'text-brand-600' : 'text-gray-400')}>
                            {isIn ? '✓ In' : 'Out'}
                          </span>
                        </button>

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
          })}
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
              {cards.map(card => (
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
                          {card.players.map(cp => (
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
                    {card.players.map(cp => {
                      const checkIn = checkedInMap.get(cp.player.id)
                      return (
                        <div key={cp.id} className="flex items-center justify-between text-sm bg-gray-50 px-3 py-1.5 rounded dark:bg-gray-700/50">
                          <span className={cp.player.id === card.scorekeeperId ? 'font-medium text-brand-700 dark:text-brand-300' : ''}>
                            {cp.player.user.name}
                          </span>
                          <div className="flex items-center gap-2">
                            {checkIn?.hasPaid && (
                              <span className="text-xs text-green-600 font-semibold">$</span>
                            )}
                            <span className="text-xs text-gray-400">{cp.player.division?.code ?? '—'}</span>
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

                    {/* Add any checked-in player not yet on this card */}
                    {(() => {
                      const cardPlayerIds = new Set(card.players.map(cp => cp.playerId))
                      const addable = checkIns.filter(ci => !assignedPlayerIds.has(ci.playerId) || cardPlayerIds.has(ci.playerId) === false)
                        .filter(ci => !cardPlayerIds.has(ci.playerId))
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
              ))}

              {/* Late arrivals — checked in but not on any card */}
              {uncardedCheckIns.length > 0 && (
                <div className="card border-2 border-dashed border-amber-300 dark:border-amber-700">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-amber-500">⚠️</span>
                    <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                      Late Arrivals — Not on a card yet
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
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
