import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, Link } from 'react-router-dom'
import { api } from '../../api/client'
import type { CheckIn, Card, Player, LeagueNight } from '../../api/types'
import Spinner from '../../components/ui/Spinner'
import toast from 'react-hot-toast'
import clsx from 'clsx'

export default function AdminCheckInPage() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const [minPlayersPerCard, setMinPlayersPerCard] = useState(3)
  const [shuffle, setShuffle] = useState(true)

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

  const removePlayerMut = useMutation({
    mutationFn: ({ cardId, playerId }: { cardId: string; playerId: string }) =>
      api.delete(`/cards/${cardId}/players/${playerId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cards', id] }),
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
  const checkedInIds = new Set(checkIns.map(c => c.playerId))

  const totalHoles = nightData?.leagueNight?.holes?.length ?? 1
  const N = checkIns.length
  const previewCardCount = N === 0 ? 0
    : N < minPlayersPerCard ? 1
    : Math.min(Math.floor(N / minPlayersPerCard), totalHoles)

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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* ── Left: Check-in list ── */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Player Check-In</h2>
          <p className="text-sm text-gray-500">Toggle players present tonight. Only checked-in players appear on cards and the leaderboard.</p>

          {divisions.map(([divCode, players]) => (
            <div key={divCode} className="card">
              <h3 className="text-sm font-semibold text-gray-500 mb-3">
                {divCode}{players[0]?.division?.name ? ` — ${players[0].division.name}` : ''}
              </h3>
              <div className="space-y-2">
                {players.map(p => {
                  const isIn = checkedInIds.has(p.id)
                  return (
                    <button
                      key={p.id}
                      onClick={() => isIn ? checkOutMut.mutate(p.id) : checkInMut.mutate(p.id)}
                      className={clsx(
                        'w-full flex items-center justify-between px-4 py-3 rounded-lg border text-sm transition-colors min-h-[48px]',
                        isIn
                          ? 'bg-brand-50 border-brand-300 text-brand-800 dark:bg-brand-900/30 dark:border-brand-700 dark:text-brand-200'
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-600'
                      )}
                    >
                      <span className="font-medium">{p.user.name}</span>
                      <span className={clsx(
                        'text-sm font-semibold',
                        isIn ? 'text-brand-600' : 'text-gray-400'
                      )}>
                        {isIn ? '✓ In' : 'Out'}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
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
                      <p className="text-xs text-gray-500">Starts at Hole #{card.startingHole}</p>
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
                    {card.players.map(cp => (
                      <div key={cp.id} className="flex items-center justify-between text-sm bg-gray-50 px-3 py-1.5 rounded dark:bg-gray-700/50">
                        <span className={cp.player.id === card.scorekeeperId ? 'font-medium text-brand-700 dark:text-brand-300' : ''}>
                          {cp.player.user.name}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-400">{cp.player.division?.code ?? '—'}</span>
                          <button
                            onClick={() => removePlayerMut.mutate({ cardId: card.id, playerId: cp.player.id })}
                            className="text-gray-300 hover:text-red-400 text-xs"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
