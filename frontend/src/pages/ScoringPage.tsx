import { useState, useEffect, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { useAuth } from '../store/auth'
import type { LeagueNight, Card, Player, Score, Position, Hole, Round, NightHighlights } from '../api/types'
import ScoreInput from '../components/ui/ScoreInput'
import Spinner from '../components/ui/Spinner'
import toast from 'react-hot-toast'

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

  const rows = players
    .map(player => {
      let total = 0
      let bonuses = 0
      const holeScores = holes.map(hole => {
        const s = getVal(player.id, hole.id, round.id, 'SHORT')
        const l = getVal(player.id, hole.id, round.id, 'LONG')
        if (s === 3 && l === 3) bonuses++
        total += s + l
        return { short: s, long: l }
      })
      return { player, total, bonuses, holeScores }
    })
    .sort((a, b) => b.total - a.total)

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
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                <th className="text-left px-4 py-2 font-medium text-gray-500">#</th>
                <th className="text-left px-4 py-2 font-medium text-gray-500">Player</th>
                {holes.map(h => (
                  <th key={h.id} className="px-2 py-2 font-medium text-gray-500 text-center min-w-[3rem]">
                    H{h.number}
                  </th>
                ))}
                <th className="px-4 py-2 font-medium text-gray-500 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ player, total, bonuses, holeScores }, rank) => (
                <tr key={player.id} className="border-b border-gray-100 dark:border-gray-700 last:border-0">
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">{rank + 1}</td>
                  <td className="px-4 py-3">
                    <span className="font-medium">{player.user.name}</span>
                    {player.division?.code && (
                      <span className="text-xs text-gray-400 ml-1.5">{player.division.code}</span>
                    )}
                  </td>
                  {holeScores.map((hs, i) => (
                    <td key={i} className="px-2 py-3 text-center">
                      <span className={`font-semibold ${hs.short + hs.long === 6 ? 'text-yellow-600' : 'text-gray-700 dark:text-gray-300'}`}>
                        {hs.short + hs.long}
                      </span>
                      <span className="block text-[10px] text-gray-400">{hs.short}/{hs.long}</span>
                    </td>
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

      {nextRound ? (
        <button onClick={onContinue} className="btn-primary w-full py-3 text-base">
          Start Round {nextRound.number} →
        </button>
      ) : (
        <div className="card text-center py-6 text-gray-500 font-medium">
          All rounds complete!
        </div>
      )}
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

  const rows = players.map(player => {
    let totalMade = 0
    let bonuses = 0
    for (const round of rounds) {
      for (const hole of holes) {
        const s = getVal(player.id, hole.id, round.id, 'SHORT')
        const l = getVal(player.id, hole.id, round.id, 'LONG')
        totalMade += s + l
        if (s === 3 && l === 3) bonuses++
      }
    }
    return { player, totalMade, bonuses, totalScore: totalMade + bonuses }
  }).sort((a, b) => b.totalScore - a.totalScore)

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
        <p className="text-5xl mb-3">🏁</p>
        <h2 className="text-2xl font-bold">Card Complete!</h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
          Overall standings will be posted once all cards are scored
        </p>
      </div>

      {/* Card final scores */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
          <h3 className="font-semibold text-sm">Final Scores — {cardName}</h3>
        </div>
        <div className="divide-y divide-gray-50 dark:divide-gray-700">
          {rows.map(({ player, totalMade, bonuses, totalScore }, i) => (
            <div key={player.id} className="flex items-center gap-3 px-4 py-3">
              <span className="text-base font-bold text-gray-400 w-6 shrink-0 text-center">{i + 1}</span>
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

export default function ScoringPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const cardIdParam = searchParams.get('card')
  const queryClient = useQueryClient()
  const { isAdmin, user } = useAuth()
  const [holeIndex, setHoleIndex] = useState(0)
  const [roundIndex, setRoundIndex] = useState(0)
  const [showSummary, setShowSummary] = useState(false)
  const [showFinish, setShowFinish] = useState(false)
  const autoPositioned = useRef(false)

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

  // Base player order (un-rotated) for the summary — shows everyone in original throw order
  const summaryPlayers: Player[] = isAdmin && !activeCard
    ? players
    : basePlayers

  const existingScores = scoresData?.scores ?? []
  const scoreMap = new Map<ScoreKey, Score>()
  for (const s of existingScores) {
    scoreMap.set(`${s.playerId}::${s.holeId}::${s.roundId}::${s.position}` as ScoreKey, s)
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
    } else if (!isLastRound) {
      setShowSummary(true)
    } else {
      setShowFinish(true)
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

  const nextLabel = showSummary ? null : isLastHole ? (isLastRound ? 'Finish →' : 'Review →') : 'Next →'
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
          onContinue={startNextRound}
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
          <div>
            <h1 className="text-lg sm:text-xl font-bold">
              {activeCard ? activeCard.name : 'Score Entry'}
            </h1>
            {rounds.length > 1 && (
              <p className="text-xs text-gray-500 mt-0.5">Round {roundIndex + 1} of {rounds.length}</p>
            )}
          </div>
          <div className="text-xs font-medium">
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
          {holes.map((h, i) => (
            <button
              key={h.id}
              onClick={() => setHoleIndex(i)}
              className={`w-7 h-7 rounded-full text-xs font-semibold transition-colors ${
                i === holeIndex
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400'
              }`}
            >
              {h.number}
            </button>
          ))}
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
            <span>Player</span>
            <span>Div</span>
            <span>Short (3 discs)</span>
            <span>Long (3 discs)</span>
          </div>

          <div className="divide-y divide-gray-50 dark:divide-gray-700">
            {players.map((player, throwPos) => {
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
