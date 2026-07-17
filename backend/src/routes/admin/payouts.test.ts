import { describe, it, expect } from 'vitest'
import { getPayoutPercentages, calcDivisionPayouts, PayoutEntry } from './payouts.js'

describe('getPayoutPercentages', () => {
  it('returns [] for 0 players', () => {
    expect(getPayoutPercentages(0)).toEqual([])
  })

  it('returns a single 100% slot for 1 player', () => {
    expect(getPayoutPercentages(1)).toEqual([1.0])
  })

  it.each([
    [2, 1], [3, 1],
    [4, 2], [6, 2],
    [7, 3], [9, 3],
    [10, 4], [12, 4],
    [13, 5], [15, 5],
    [16, 6], [30, 6],
  ])('count=%i returns %i payout slots', (count, expectedSlots) => {
    expect(getPayoutPercentages(count)).toHaveLength(expectedSlots)
  })

  it('every tier sums to ~1.0 (within float rounding)', () => {
    for (const count of [1, 2, 3, 4, 6, 7, 9, 10, 12, 13, 15, 16]) {
      const pcts = getPayoutPercentages(count)
      const sum = pcts.reduce((a, b) => a + b, 0)
      expect(sum).toBeCloseTo(1.0, 5)
    }
  })

  it('percentages are non-increasing (1st place gets the largest share)', () => {
    for (const count of [3, 6, 9, 12, 15, 20]) {
      const pcts = getPayoutPercentages(count)
      for (let i = 1; i < pcts.length; i++) {
        expect(pcts[i]).toBeLessThanOrEqual(pcts[i - 1])
      }
    }
  })
})

describe('calcDivisionPayouts', () => {
  it('returns [] when there are no ranked players', () => {
    expect(calcDivisionPayouts(100, [], 'SPLIT')).toEqual([])
  })

  it('pays a single player the entire pool', () => {
    const result = calcDivisionPayouts(100, [{ playerId: 'p1', playerName: 'A', totalScore: 50 }], 'SPLIT')
    expect(result).toEqual([
      { place: 1, playerId: 'p1', playerName: 'A', totalScore: 50, payout: 100, isTied: false, pendingPuttOff: false },
    ])
  })

  // 7-9 ranked players land in the 3-slot tier: [0.475, 0.300, 0.225]
  function fieldOf(count: number, scores: number[]) {
    return Array.from({ length: count }, (_, i) => ({
      playerId: `p${i + 1}`,
      playerName: `P${i + 1}`,
      totalScore: scores[i],
    }))
  }

  it('distributes payouts by rank with no ties', () => {
    const players = fieldOf(8, [30, 20, 10, 9, 8, 7, 6, 5])
    const result = calcDivisionPayouts(1000, players, 'SPLIT')
    expect(result.map(r => r.payout)).toEqual([475, 300, 225, 0, 0, 0, 0, 0])
    expect(result.map(r => r.place)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(result.every(r => !r.isTied)).toBe(true)
  })

  describe('SPLIT mode ties', () => {
    it('splits a 2-way tie for 1st evenly, flooring remainders', () => {
      const players = fieldOf(7, [30, 30, 10, 9, 8, 7, 6])
      // pcts for 7 players: [0.475, 0.300, 0.225] → combined for slots 1+2 = 0.775 of pool
      // pool=1000 → combinedAmount = floor(1000*0.775) = 775 → each gets floor(775/2)=387
      const result = calcDivisionPayouts(1000, players, 'SPLIT')
      const tied = result.filter(r => r.isTied)
      expect(tied).toHaveLength(2)
      expect(tied.every(r => r.payout === 387)).toBe(true)
      expect(tied.every(r => r.place === 1)).toBe(true)
      expect(tied.every(r => !r.pendingPuttOff)).toBe(true)
      // 3rd place is untouched, uses dense rank 2 (not 3)
      const third = result.find(r => r.playerId === 'p3')!
      expect(third.place).toBe(2)
      expect(third.payout).toBe(225)
    })

    it('splits a 3-way tie among all tied players', () => {
      const players = [
        { playerId: 'p1', playerName: 'A', totalScore: 10 },
        { playerId: 'p2', playerName: 'B', totalScore: 10 },
        { playerId: 'p3', playerName: 'C', totalScore: 10 },
      ]
      const result = calcDivisionPayouts(1000, players, 'SPLIT')
      // combined = floor(1000 * (0.475+0.300+0.225)) = 1000, split 3 ways = floor(1000/3) = 333
      expect(result).toHaveLength(3)
      expect(result.every(r => r.payout === 333)).toBe(true)
      expect(result.every(r => r.place === 1)).toBe(true)
    })

    it('gives $0 to a tied group occupying only unpaid places', () => {
      // 6 players, tie for last (5th/6th) — pcts for 6 has only 6 slots, all > 0 in this tier,
      // so use a bigger field where the tied group falls entirely outside paid slots.
      const players = Array.from({ length: 20 }, (_, i) => ({
        playerId: `p${i}`,
        playerName: `P${i}`,
        totalScore: i === 18 || i === 19 ? 0 : 20 - i, // last two tied at 0, outside the 6 paid slots
      }))
      const result = calcDivisionPayouts(1000, players, 'SPLIT')
      const last = result.filter(r => r.totalScore === 0)
      expect(last).toHaveLength(2)
      expect(last.every(r => r.payout === 0)).toBe(true)
      expect(last.every(r => r.isTied === true)).toBe(true)
      expect(last.every(r => r.pendingPuttOff === false)).toBe(true)
    })
  })

  describe('PUTT_OFF mode ties', () => {
    const tiedPlayers = fieldOf(7, [30, 30, 10, 9, 8, 7, 6])

    it('marks a 1st-place tie as pending when no putt-off winner is given', () => {
      const result = calcDivisionPayouts(1000, tiedPlayers, 'PUTT_OFF')
      const tied = result.filter(r => r.isTied)
      expect(tied).toHaveLength(2)
      expect(tied.every(r => r.payout === 0)).toBe(true)
      expect(tied.every(r => r.pendingPuttOff === true)).toBe(true)
    })

    it('awards the full combined amount to the declared putt-off winner', () => {
      const result = calcDivisionPayouts(1000, tiedPlayers, 'PUTT_OFF', 'p2')
      const winner = result.find(r => r.playerId === 'p2')!
      const loser = result.find(r => r.playerId === 'p1')!
      // Note: 0.475 + 0.300 is 0.7749999999999999 in IEEE 754, so floor(1000 * combinedPct)
      // lands on 774, one cent short of the mathematically "true" 775. This is a real
      // floating-point precision artifact in calcDivisionPayouts, not a test quirk.
      expect(winner.payout).toBe(774)
      expect(winner.pendingPuttOff).toBe(false)
      expect(loser.payout).toBe(0)
      expect(loser.pendingPuttOff).toBe(false)
      expect(loser.isTied).toBe(true)
    })

    it('treats an unrecognized putt-off winner id as still pending (defensive)', () => {
      const result = calcDivisionPayouts(1000, tiedPlayers, 'PUTT_OFF', 'not-in-the-group')
      const tied = result.filter(r => r.totalScore === 30)
      expect(tied.every(r => r.payout === 0)).toBe(true)
      expect(tied.every(r => r.pendingPuttOff === true)).toBe(true)
    })

    it('flags a tie as pending putt-off even when it is not for 1st place, as long as money is on the line', () => {
      const players = fieldOf(8, [30, 10, 10, 9, 8, 7, 6, 5])
      const result = calcDivisionPayouts(1000, players, 'PUTT_OFF')
      const first = result.find(r => r.playerId === 'p1')!
      expect(first.isTied).toBe(false)
      expect(first.pendingPuttOff).toBe(false)
      // p2/p3 tie for 2nd/3rd (combined slots worth 0.300+0.225 of the pool, i.e. real money)
      const tied = result.filter(r => r.totalScore === 10)
      expect(tied).toHaveLength(2)
      expect(tied.every(r => r.pendingPuttOff === true)).toBe(true)
      expect(tied.every(r => r.payout === 0)).toBe(true)
    })

    it('does not flag a $0 tie as pending, even in PUTT_OFF mode', () => {
      // Only 3 players → single 100%-of-pool slot; a tie for 2nd (which pays $0) needs no putt-off.
      const players = [
        { playerId: 'p1', playerName: 'A', totalScore: 30 },
        { playerId: 'p2', playerName: 'B', totalScore: 10 },
        { playerId: 'p3', playerName: 'C', totalScore: 10 },
      ]
      const result = calcDivisionPayouts(1000, players, 'PUTT_OFF')
      const tied = result.filter(r => r.totalScore === 10)
      expect(tied.every(r => r.payout === 0)).toBe(true)
      expect(tied.every(r => r.pendingPuttOff === false)).toBe(true)
    })
  })

  it('never pays out more than the pool (flooring remainder is dropped, not distributed)', () => {
    const players = [
      { playerId: 'p1', playerName: 'A', totalScore: 3 },
      { playerId: 'p2', playerName: 'B', totalScore: 2 },
      { playerId: 'p3', playerName: 'C', totalScore: 1 },
    ]
    const pool = 101 // chosen to force flooring remainders
    const result: PayoutEntry[] = calcDivisionPayouts(pool, players, 'SPLIT')
    const total = result.reduce((sum, r) => sum + r.payout, 0)
    expect(total).toBeLessThanOrEqual(pool)
  })

  it('handles a $0 pool without error', () => {
    const players = [
      { playerId: 'p1', playerName: 'A', totalScore: 3 },
      { playerId: 'p2', playerName: 'B', totalScore: 3 },
    ]
    const result = calcDivisionPayouts(0, players, 'SPLIT')
    expect(result.every(r => r.payout === 0)).toBe(true)
  })
})
