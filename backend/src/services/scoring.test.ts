import { describe, it, expect } from 'vitest'
import { computeStationHole } from './scoring.js'

describe('computeStationHole', () => {
  it('station 0, round 1, 6 holes → hole 1', () => {
    expect(computeStationHole(0, 1, 6)).toBe(1)
  })

  it('station 0, round 2, 6 holes → hole 2', () => {
    expect(computeStationHole(0, 2, 6)).toBe(2)
  })

  it('station 5, round 2, 6 holes → wraps to hole 1', () => {
    expect(computeStationHole(5, 2, 6)).toBe(1)
  })

  it('station 3, round 1, 6 holes → hole 4', () => {
    expect(computeStationHole(3, 1, 6)).toBe(4)
  })

  it('works with arbitrary hole counts', () => {
    // 9 holes, station 8, round 2 → (8 + 2 - 1) % 9 + 1 = 9 % 9 + 1 = 0 + 1 = 1
    expect(computeStationHole(8, 2, 9)).toBe(1)
  })
})
