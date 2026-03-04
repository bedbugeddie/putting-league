import { useState, useEffect, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { useAuth } from '../store/auth'
import type { LeagueNight, Card, Player, Score, Position, Hole, Round, NightHighlights } from '../api/types'
import ScoreInput from '../components/ui/ScoreInput'
import Spinner from '../components/ui/Spinner'
import SortableHeader from '../components/ui/SortableHeader'
import { useSortable } from '../hooks/useSortable'
import toast from 'react-hot-toast'
import clsx from 'clsx'

type ScoreKey = `${string}::${string}::${string}::${Position}` // playerId::holeId::roundId::position

function rotateLeft<T>(arr: T[], by: number): T[] {
  if (arr.length === 0) return arr
  const n = by % arr.length
  return [...arr.slice(n), ...arr.slice(0, n)]
}

// ── Round summary ──────────────────────────────────────────────────────────────

function RoundSummary({
  round, nextRound, holes, players, scoreMap, localOverrides, onContinue,
}: {
  round: Round
  nextRound: Round | null
  holes: Hole[]
  players: Player[]
  scoreMap: Map<ScoreKey, Score>
  localOverrides: Map<ScoreKey, number>
  onContinue: () => void
}) {
  function getVal(playerId: string, holeId: string, roundId: string, pos: Position): number {
    const key = `${playerId}::${holeId}::${roundId}::${pos}` as ScoreKey
    return localOverrides.get(key) ?? scoreMap.get(key)?.made ?? 0
  }

  const { sortKey, sortDir, toggleSort } = useSortable('score', 'desc')

  const rawRows = players.map(player => {
    let total = 0
    let bonuses = 0
    const holeScores = holes.map(hole => {
      const s = getVal(player.id, hole.id, round.id, 'SHORT')
      const l = getVal(player.id, hole.id, round.id, 'LONG')
      bonuses += (s === 3 ? 1 : 0) + (l === 3 ? 1 : 0)
      total += s + l
      return { short: s, long: l }
    })
    return { player, total: total + bonuses, bonuses, holeScores }
  })

  const scoreRankMap = new Map(
    [...rawRows].sort((a, b) => b.total - a.total).map((r, i) => [r.player.id, i + 1])
  )

  const rows = [...rawRows].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1
    if (sortKey === 'player') return dir * a.player.user.name.localeCompare(b.player.user.name)
    return dir * (a.total - b.total)
  })

  return (
    <div className="space-y-4 pb-6">
      {/* Header */}
      <div className="card text-center py-6">
        <p className="text-4xl mb-2">🎉</p>
        <h2 className="text-2xl font-bold">Round {round.number} Complete!</h2>
        {nextRound && (
          <p className="text-gray-500 text-sm mt-1">Review your scores before starting Round {nextRound.number}</p>
        )}
      </div>

      {/* Scores table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              {/* Hole number spans two sub-columns each */}
              <tr className="bg-gray-50 dark:bg-gray-700/50">
                <th className="text-left px-4 py-1.5 font-medium text-gray-500" rowSpan={2}>#</th>
                <SortableHeader sortKey="player" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} className="text-left px-4 py-1.5 font-medium text-gray-500" rowSpan={2}>Player</SortableHeader>
                {holes.map(h => (
                  <th key={h.id} colSpan={2} className="px-2 py-1.5 font-medium text-gray-500 text-center border-l border-gray-200 dark:border-gray-600">
                    H{h.number}
                  </th>
                ))}
                <SortableHeader sortKey="score" currentKey={sortKey} currentDir={sortDir} onSort={toggleSort} className="px-4 py-1.5 font-medium text-gray-500 text-right" rowSpan={2}>Total</SortableHeader>
              </tr>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                {holes.map(h => (
                  <>
                    <th key={`${h.id}-s`} className="px-2 pb-1.5 text-[10px] font-medium text-gray-400 text-center border-l border-gray-200 dark:border-gray-600">S</th>
                    <th key={`${h.id}-l`} className="px-2 pb-1.5 text-[10px] font-medium text-gray-400 text-center">L</th>
                  </>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ player, total, bonuses, holeScores }) => (
                <tr key={player.id} className="border-b border-gray-100 dark:border-gray-700 last:border-0">
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">{scoreRankMap.get(player.id) ?? 0}</td>
                  <td className="px-4 py-3">
                    <span className="font-medium">{player.user.name}</span>
                    {player.division?.code && (
                      <span className="text-xs text-gray-400 ml-1.5">{player.division.code}</span>
                    )}
                  </td>
                  {holeScores.map((hs, i) => (
                    <>
                      <td key={`${i}-s`} className={`px-2 py-3 text-center font-semibold border-l border-gray-100 dark:border-gray-700 ${hs.short === 3 ? 'text-yellow-600' : 'text-gray-700 dark:text-gray-300'}`}>
                        {hs.short}
                      </td>
                      <td key={`${i}-l`} className={`px-2 py-3 text-center font-semibold ${hs.long === 3 ? 'text-yellow-600' : 'text-gray-700 dark:text-gray-300'}`}>
                        {hs.long}
                      </td>
                    </>
                  ))}
                  <td className="px-4 py-3 text-right">
                    <span className="text-xl font-bold text-brand-700">{total}</span>
                    {bonuses > 0 && (
                      <span className="block text-xs text-yellow-600 font-medium">+{bonuses} ★</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <button onClick={onContinue} className="btn-primary w-full py-3 text-base">
        {nextRound ? `Start Round ${nextRound.number} →` : 'Finish →'}
      </button>
    </div>
  )
}

// ── Finish / standings screen ───────────────────────────────────────────────────

function FinishView({
  nightId, cardName, onBack, players, holes, rounds, scoreMap, localOverrides,
}: {
  nightId: string
  cardName: string
  onBack: () => void
  players: Player[]
  holes: Hole[]
  rounds: Round[]
  scoreMap: Map<ScoreKey, Score>
  localOverrides: Map<ScoreKey, number>
}) {
  const { data: hlData } = useQuery<NightHighlights>({
    queryKey: ['highlights', nightId],
    queryFn: () => api.get(`/league-nights/${nightId}/highlights`),
  })

  function getVal(playerId: string, holeId: string, roundId: string, pos: Position): number {
    const key = `${playerId}::${holeId}::${roundId}::${pos}` as ScoreKey
    return localOverrides.get(key) ?? scoreMap.get(key)?.made ?? 0
  }

  const { sortKey: fSortKey, sortDir: fSortDir, toggleSort: fToggleSort } = useSortable('score', 'desc')

  const rawRows = players.map(player => {
    let totalMade = 0
    let bonuses = 0
    for (const round of rounds) {
      for (const hole of holes) {
        const s = getVal(player.id, hole.id, round.id, 'SHORT')
        const l = getVal(player.id, hole.id, round.id, 'LONG')
        totalMade += s + l
        bonuses += (s === 3 ? 1 : 0) + (l === 3 ? 1 : 0)
      }
    }
    return { player, totalMade, bonuses, totalScore: totalMade + bonuses }
  })

  const scoreRankMap = new Map(
    [...rawRows].sort((a, b) => b.totalScore - a.totalScore).map((r, i) => [r.player.id, i + 1])
  )

  const rows = [...rawRows].sort((a, b) => {
    const dir = fSortDir === 'asc' ? 1 : -1
    if (fSortKey === 'player') return dir * a.player.user.name.localeCompare(b.player.user.name)
    return dir * (a.totalScore - b.totalScore)
  })

  const highlights = hlData

  return (
    <div className="space-y-4 pb-6">
      {/* Header */}
      <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-gray-50 border-b border-gray-200 dark:bg-gray-900 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="btn-secondary text-sm py-1 px-3">
            ← Back
          </button>
          <span className="font-semibold">{cardName}</span>
        </div>
      </div>

      {/* Hero */}
      <div className="card text-center py-8">
        <p className="text-5xl mb-3">✅</p>
        <h2 className="text-2xl font-bold">Card Complete!</h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
          Overall standings will be posted once all cards are scored
        </p>
      </div>

      {/* Card final scores */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 flex items-center justify-between">
          <h3 className="font-semibold text-sm">Final Scores — {cardName}</h3>
          <div className="flex items-center gap-1 text-xs">
            <button
              onClick={() => fToggleSort('score')}
              className={clsx('px-2 py-0.5 rounded cursor-pointer select-none', fSortKey === 'score' ? 'text-brand-600 dark:text-brand-400 font-semibold' : 'text-gray-400 hover:text-gray-600')}
            >
              Score {fSortKey === 'score' ? (fSortDir === 'asc' ? '▲' : '▼') : '⇅'}
            </button>
            <button
              onClick={() => fToggleSort('player')}
              className={clsx('px-2 py-0.5 rounded cursor-pointer select-none', fSortKey === 'player' ? 'text-brand-600 dark:text-brand-400 font-semibold' : 'text-gray-400 hover:text-gray-600')}
            >
              Name {fSortKey === 'player' ? (fSortDir === 'asc' ? '▲' : '▼') : '⇅'}
            </button>
          </div>
        </div>
        <div className="divide-y divide-gray-50 dark:divide-gray-700">
          {rows.map(({ player, totalMade, bonuses, totalScore }) => (
            <div key={player.id} className="flex items-center gap-3 px-4 py-3">
              <span className="text-base font-bold text-gray-400 w-6 shrink-0 text-center">{scoreRankMap.get(player.id) ?? 0}</span>
              <div className="flex-1 min-w-0">
                <span className="font-medium">{player.user.name}</span>
                {player.division?.code && (
                  <span className="text-xs text-gray-400 ml-1.5">{player.division.code}</span>
                )}
                {bonuses > 0 && (
                  <span className="text-xs text-yellow-600 dark:text-yellow-400 ml-2">+{bonuses} ★</span>
                )}
              </div>
              <span className="text-xl font-bold text-brand-700 dark:text-brand-400 shrink-0">{totalScore}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Highlights */}
      {highlights && (
        <div className="card space-y-4">
          <h3 className="font-semibold text-base">Tonight's Highlights</h3>

          {highlights.mostBonuses && (
            <div className="flex items-start gap-3">
              <span className="text-2xl shrink-0">🎯</span>
              <div>
                <p className="font-medium">{highlights.mostBonuses.playerName}
                  <span className="text-xs text-gray-400 font-normal ml-1.5">{highlights.mostBonuses.divisionCode}</span>
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Most bonus points — {highlights.mostBonuses.count} perfect shots
                </p>
              </div>
            </div>
          )}

          {highlights.longestStreak && (
            <div className="flex items-start gap-3">
              <span className="text-2xl shrink-0">🔥</span>
              <div>
                <p className="font-medium">{highlights.longestStreak.playerName}
                  <span className="text-xs text-gray-400 font-normal ml-1.5">{highlights.longestStreak.divisionCode}</span>
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Longest streak — {highlights.longestStreak.streak} consecutive perfect holes
                </p>
              </div>
            </div>
          )}

          {highlights.mostImproved && (
            <div className="flex items-start gap-3">
              <span className="text-2xl shrink-0">📈</span>
              <div>
                <p className="font-medium">{highlights.mostImproved.playerName}
                  <span className="text-xs text-gray-400 font-normal ml-1.5">{highlights.mostImproved.divisionCode}</span>
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Most improved — +{highlights.mostImproved.delta} from last time
                  &nbsp;({highlights.mostImproved.previous} → {highlights.mostImproved.current})
                </p>
              </div>
            </div>
          )}

          {highlights.perfectRounders.map((pr, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="text-2xl shrink-0">⭐</span>
              <div>
                <p className="font-medium">{pr.playerName}
                  <span className="text-xs text-gray-400 font-normal ml-1.5">{pr.divisionCode}</span>
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Perfect round — flawless Round {pr.roundNumber}!
                </p>
              </div>
            </div>
          ))}

          {!highlights.mostBonuses && !highlights.longestStreak && !highlights.mostImproved && highlights.perfectRounders.length === 0 && (
            <p className="text-gray-400 text-sm">No special highlights this time — keep putting!</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ScoringPage({ adminMode = false }: { adminMode?: boolean }) {
  const { id } = useParams<{ id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const cardIdParam = searchParams.get('card')
  const queryClient = useQueryClient()
  const { isAdmin: _isAdmin, user } = useAuth()
  // Admin card-switching is only available when accessed from the admin panel
  const isAdmin = adminMode && _isAdmin
  const [holeIndex, setHoleIndex] = useState(0)
  const [roundIndex, setRoundIndex] = useState(0)
  const [showSummary, setShowSummary] = useState(false)
  const [showFinish, setShowFinish] = useState(false)
  const autoPositioned = useRef(false)
  const { sortKey: gridSortKey, sortDir: gridSortDir, toggleSort: toggleGridSort } = useSortable('player', 'asc')

  const { data: nightData, isLoading: nightLoading } = useQuery<{ leagueNight: LeagueNight }>({
    queryKey: ['league-night', id],
    queryFn: () => api.get(`/league-nights/${id}`),
    enabled: !!id,
  })

  const { data: cardsData, isLoading: cardsLoading } = useQuery<{ cards: Card[] }>({
    queryKey: ['cards', id],
    queryFn: () => api.get(`/league-nights/${id}/cards`),
    enabled: !!id,
  })

  const { data: scoresData } = useQuery<{ scores: Score[] }>({
    queryKey: ['scores', id],
    queryFn: () => api.get(`/league-nights/${id}/scores`),
    enabled: !!id,
  })

  // Once all data loads, jump to the first round+hole still missing scores.
  useEffect(() => {
    if (autoPositioned.current) return
    if (!scoresData || !nightData || !cardsData) return

    const night = nightData.leagueNight
    const cards = cardsData.cards ?? []
    const myCard = user?.player?.id ? cards.find(c => c.scorekeeperId === user.player!.id) : null
    const adminCard = isAdmin && cardIdParam ? cards.find(c => c.id === cardIdParam) ?? null : null
    const cardForEffect = adminCard ?? myCard
    if (!cardForEffect) return

    const allHoles = night.holes ?? []
    const rounds = night.rounds ?? []
    const startingHole = cardForEffect.startingHole ?? 1
    const holes = [
      ...allHoles.filter(h => h.number >= startingHole),
      ...allHoles.filter(h => h.number < startingHole),
    ]
    if (rounds.length === 0 || holes.length === 0) return

    autoPositioned.current = true

    const scoreSet = new Set(
      scoresData.scores.map(s => `${s.playerId}::${s.holeId}::${s.roundId}::${s.position}`)
    )
    const playerIds = cardForEffect.players.map(cp => cp.playerId)

    for (let r = 0; r < rounds.length; r++) {
      for (let h = 0; h < holes.length; h++) {
        const allScored = playerIds.every(pid =>
          scoreSet.has(`${pid}::${holes[h].id}::${rounds[r].id}::SHORT`) &&
          scoreSet.has(`${pid}::${holes[h].id}::${rounds[r].id}::LONG`)
        )
        if (!allScored) {
          setRoundIndex(r)
          setHoleIndex(h)
          return
        }
      }
    }
    // All holes/rounds complete — land on last
    setRoundIndex(rounds.length - 1)
    setHoleIndex(holes.length - 1)
  }, [scoresData, nightData, cardsData])

  const [pendingSaves, setPendingSaves] = useState(0)
  const [localOverrides, setLocalOverrides] = useState<Map<ScoreKey, number>>(new Map())

  // Track holes the user has navigated away from so we can flag incomplete ones in red
  const [visitedHoles, setVisitedHoles] = useState<Set<number>>(new Set())
  const prevHoleIndexRef = useRef<number | null>(null)

  useEffect(() => {
    const prev = prevHoleIndexRef.current
    if (prev !== null && prev !== holeIndex) {
      setVisitedHoles(s => new Set(s).add(prev))
    }
    prevHoleIndexRef.current = holeIndex
  }, [holeIndex])

  // Reset visited state when moving to a new round
  useEffect(() => {
    setVisitedHoles(new Set())
    prevHoleIndexRef.current = null
  }, [roundIndex])

  const night = nightData?.leagueNight
  const cards = cardsData?.cards ?? []
  const myPlayerId = user?.player?.id
  const myCard = myPlayerId ? cards.find(c => c.scorekeeperId === myPlayerId) : null
  const adminCard = isAdmin && cardIdParam ? cards.find(c => c.id === cardIdParam) ?? null : null
  const activeCard = adminCard ?? myCard

  const basePlayers: Player[] = activeCard?.players.map(cp => cp.player) ?? []

  const players: Player[] = isAdmin && !activeCard
    ? Array.from(
        new Map(
          cards.flatMap(c => c.players.map(cp => cp.player)).map(p => [p.id, p])
        ).values()
      )
    : rotateLeft(basePlayers, holeIndex)

  // Sorted view for admin all-cards mode only; otherwise preserve throw-order rotation
  const displayPlayers: Player[] = (() => {
    if (!isAdmin || activeCard) return players
    const dir = gridSortDir === 'asc' ? 1 : -1
    return [...players].sort((a, b) => {
      if (gridSortKey === 'division') return dir * ((a.division?.code ?? '').localeCompare(b.division?.code ?? ''))
      return dir * a.user.name.localeCompare(b.user.name)
    })
  })()

  // Base player order (un-rotated) for the summary — shows everyone in original throw order
  const summaryPlayers: Player[] = isAdmin && !activeCard
    ? players
    : basePlayers

  const existingScores = scoresData?.scores ?? []
  const scoreMap = new Map<ScoreKey, Score>()
  for (const s of existingScores) {
    scoreMap.set(`${s.playerId}::${s.holeId}::${s.roundId}::${s.position}` as ScoreKey, s)
  }

  function switchCard(newCardId: string) {
    setHoleIndex(0)
    setRoundIndex(0)
    setShowSummary(false)
    setShowFinish(false)
    autoPositioned.current = false
    setLocalOverrides(new Map())
    setVisitedHoles(new Set())
    setSearchParams(newCardId ? { card: newCardId } : {})
  }

  async function handleScoreChange(
    playerId: string, holeId: string, roundId: string,
    position: Position, made: number
  ) {
    const key: ScoreKey = `${playerId}::${holeId}::${roundId}::${position}`
    setLocalOverrides(prev => new Map(prev).set(key, made))
    setPendingSaves(n => n + 1)
    try {
      await api.post('/scoring/bulk', { scores: [{ playerId, holeId, roundId, position, made }] })
      queryClient.invalidateQueries({ queryKey: ['scores', id] })
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to save score')
    } finally {
      setPendingSaves(n => n - 1)
    }
  }

  if (nightLoading || cardsLoading) {
    return <div className="flex justify-center py-20"><Spinner className="h-10 w-10" /></div>
  }

  if (!night) return <div className="card">League night not found.</div>

  const allHoles = night.holes ?? []
  const rounds = night.rounds ?? []

  const startingHole = activeCard?.startingHole ?? 1
  const holes = [
    ...allHoles.filter(h => h.number >= startingHole),
    ...allHoles.filter(h => h.number < startingHole),
  ]

  const currentHole = holes[holeIndex] ?? holes[0]
  const currentRound = rounds[roundIndex]

  const isFirstHole = holeIndex === 0
  const isLastHole = holeIndex === holes.length - 1
  const isFirstRound = roundIndex === 0
  const isLastRound = roundIndex === rounds.length - 1

  function goNext() {
    if (!isLastHole) {
      setHoleIndex(h => h + 1)
    } else {
      setShowSummary(true)
    }
  }

  function goPrev() {
    if (showSummary) {
      // Back from summary → return to last hole of current round
      setShowSummary(false)
      return
    }
    if (!isFirstHole) {
      setHoleIndex(h => h - 1)
    } else if (!isFirstRound) {
      setHoleIndex(holes.length - 1)
      setRoundIndex(r => r - 1)
    }
  }

  function startNextRound() {
    setShowSummary(false)
    setHoleIndex(0)
    setRoundIndex(r => r + 1)
  }

  const nextLabel = showSummary ? null : isLastHole ? 'Review →' : 'Next →'
  const prevLabel = showSummary
    ? '← Back'
    : isFirstHole && isFirstRound ? null : isFirstHole ? `← Round ${roundIndex}` : '← Prev'

  // ── Finish screen ────────────────────────────────────────────────────────────
  if (showFinish && id) {
    return (
      <FinishView
        nightId={id}
        cardName={activeCard?.name ?? 'Score Entry'}
        onBack={() => setShowFinish(false)}
        players={summaryPlayers}
        holes={holes}
        rounds={rounds}
        scoreMap={scoreMap}
        localOverrides={localOverrides}
      />
    )
  }

  // ── Round summary screen ─────────────────────────────────────────────────────
  if (showSummary && currentRound) {
    return (
      <div className="space-y-4">
        {/* Minimal header with back button */}
        <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-gray-50 border-b border-gray-200 dark:bg-gray-900 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <button onClick={() => setShowSummary(false)} className="btn-secondary text-sm py-1 px-3">
              ← Back
            </button>
            <span className="font-semibold">{activeCard?.name ?? 'Score Entry'}</span>
          </div>
        </div>

        <RoundSummary
          round={currentRound}
          nextRound={rounds[roundIndex + 1] ?? null}
          holes={holes}
          players={summaryPlayers}
          scoreMap={scoreMap}
          localOverrides={localOverrides}
          onContinue={isLastRound ? () => { setShowSummary(false); setShowFinish(true) } : startNextRound}
        />
      </div>
    )
  }

  // ── Normal scoring screen ────────────────────────────────────────────────────
  return (
    <div className="space-y-4 pb-6">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-gray-50 border-b border-gray-200 dark:bg-gray-900 dark:border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <div className="min-w-0 flex-1">
            {isAdmin && cards.length > 1 ? (
              <select
                value={cardIdParam ?? ''}
                onChange={e => switchCard(e.target.value)}
                className="input text-sm font-semibold py-1 px-2 h-auto w-auto max-w-[180px]"
              >
                <option value="">All cards</option>
                {cards.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            ) : (
              <h1 className="text-lg sm:text-xl font-bold">
                {activeCard ? activeCard.name : 'Score Entry'}
              </h1>
            )}
            {rounds.length > 1 && (
              <p className="text-xs text-gray-500 mt-0.5">Round {roundIndex + 1} of {rounds.length}</p>
            )}
          </div>
          <div className="text-xs font-medium ml-3 shrink-0">
            {pendingSaves > 0
              ? <span className="text-gray-400">Saving…</span>
              : <span className="text-green-600 dark:text-green-400">✓ Saved</span>
            }
          </div>
        </div>

        {/* Hole navigation */}
        {holes.length > 0 && (
          <div className="flex items-center gap-3">
            <button
              onClick={goPrev}
              disabled={!prevLabel}
              className="btn-secondary text-sm py-1 px-3 disabled:opacity-40 min-w-[80px]"
            >
              {prevLabel ?? '← Prev'}
            </button>
            <span className="flex-1 text-center text-sm font-semibold">
              Hole #{currentHole?.number}
              <span className="text-xs text-gray-400 font-normal ml-2">({holeIndex + 1} of {holes.length})</span>
            </span>
            <button
              onClick={goNext}
              disabled={!nextLabel}
              className="btn-secondary text-sm py-1 px-3 disabled:opacity-40 min-w-[80px]"
            >
              {nextLabel ?? 'Next →'}
            </button>
          </div>
        )}
      </div>

      {/* Hole dot indicators */}
      {holes.length > 1 && (
        <div className="flex justify-center gap-1.5 flex-wrap">
          {holes.map((h, i) => {
            const holeComplete = currentRound && basePlayers.length > 0 && basePlayers.every(player => {
              const shortKey: ScoreKey = `${player.id}::${h.id}::${currentRound.id}::SHORT`
              const longKey: ScoreKey  = `${player.id}::${h.id}::${currentRound.id}::LONG`
              return (localOverrides.get(shortKey) ?? scoreMap.get(shortKey)?.made ?? null) !== null &&
                     (localOverrides.get(longKey)  ?? scoreMap.get(longKey)?.made  ?? null) !== null
            })
            const holeIncomplete = !holeComplete && visitedHoles.has(i)
            return (
              <button
                key={h.id}
                onClick={() => setHoleIndex(i)}
                className={`w-7 h-7 rounded-full text-xs font-semibold transition-colors ${
                  i === holeIndex
                    ? 'bg-brand-600 text-white'
                    : holeComplete
                      ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/40 dark:text-green-400'
                      : holeIncomplete
                        ? 'bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-400'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400'
                }`}
              >
                {h.number}
              </button>
            )
          })}
        </div>
      )}

      {/* Current round + current hole scoring */}
      {currentHole && currentRound && (
        <div className="card p-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50 dark:bg-gray-700/50 dark:border-gray-700">
            <h2 className="text-base font-semibold">Round {currentRound.number}</h2>
            {currentRound.isComplete && (
              <span className="badge bg-green-100 text-green-800">Complete</span>
            )}
          </div>

          {/* Column headers – desktop */}
          <div className="hidden sm:grid sm:grid-cols-[1fr_3rem_1fr_1fr] gap-2 px-4 py-1.5 text-xs text-gray-400 font-medium border-b border-gray-100 dark:border-gray-700 dark:text-gray-500">
            {isAdmin && !activeCard ? (
              <>
                <button onClick={() => toggleGridSort('player')} className={clsx('text-left cursor-pointer select-none', gridSortKey === 'player' ? 'text-brand-500' : '')}>
                  Player {gridSortKey === 'player' ? (gridSortDir === 'asc' ? '▲' : '▼') : '⇅'}
                </button>
                <button onClick={() => toggleGridSort('division')} className={clsx('text-left cursor-pointer select-none', gridSortKey === 'division' ? 'text-brand-500' : '')}>
                  Div {gridSortKey === 'division' ? (gridSortDir === 'asc' ? '▲' : '▼') : '⇅'}
                </button>
              </>
            ) : (
              <>
                <span>Player</span>
                <span>Div</span>
              </>
            )}
            <span>Short (3 discs)</span>
            <span>Long (3 discs)</span>
          </div>

          <div className="divide-y divide-gray-50 dark:divide-gray-700">
            {displayPlayers.map((player, throwPos) => {
              const shortKey: ScoreKey = `${player.id}::${currentHole.id}::${currentRound.id}::SHORT`
              const longKey: ScoreKey  = `${player.id}::${currentHole.id}::${currentRound.id}::LONG`
              const shortVal = localOverrides.get(shortKey) ?? scoreMap.get(shortKey)?.made ?? null
              const longVal  = localOverrides.get(longKey)  ?? scoreMap.get(longKey)?.made  ?? null

              return (
                <div
                  key={player.id}
                  className="px-4 py-3 sm:grid sm:grid-cols-[1fr_3rem_1fr_1fr] sm:gap-2 sm:items-center"
                >
                  <div className="flex items-center gap-2 mb-2 sm:mb-0">
                    <span className="text-xs text-gray-400 w-5 shrink-0 font-mono">{throwPos + 1}.</span>
                    <div className="flex items-center justify-between flex-1 sm:block">
                      <span className="font-medium text-sm">{player.user.name}</span>
                      <span className="text-xs text-gray-400 sm:hidden">{player.division?.code}</span>
                    </div>
                  </div>
                  <span className="hidden sm:block text-xs text-gray-500">{player.division?.code}</span>
                  <div className="flex items-center gap-3 mb-2 sm:mb-0">
                    <span className="text-xs text-gray-400 sm:hidden w-10 shrink-0">Short</span>
                    <ScoreInput
                      value={shortVal}
                      onChange={v => handleScoreChange(player.id, currentHole.id, currentRound.id, 'SHORT', v)}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 sm:hidden w-10 shrink-0">Long</span>
                    <ScoreInput
                      value={longVal}
                      onChange={v => handleScoreChange(player.id, currentHole.id, currentRound.id, 'LONG', v)}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
