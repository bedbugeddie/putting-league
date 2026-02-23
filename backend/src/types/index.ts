import { FastifyRequest } from 'fastify'

// JWT payload stored in token
export interface JwtPayload {
  userId: string
  email: string
  isAdmin: boolean
}

// Augment Fastify's request type
declare module 'fastify' {
  interface FastifyRequest {
    user?: JwtPayload
  }
}

// WebSocket broadcast event types
export type WsEventType =
  | 'SCORE_UPDATED'
  | 'LEADERBOARD_UPDATED'
  | 'ROUND_COMPLETED'
  | 'LEAGUE_NIGHT_STATUS'
  | 'PUTT_OFF_UPDATED'

export interface WsEvent<T = unknown> {
  type: WsEventType
  leagueNightId: string
  payload: T
}

// Scoring helpers
export interface PlayerTotals {
  playerId: string
  playerName: string
  divisionId: string
  divisionCode: string
  totalMade: number
  totalBonus: number
  totalScore: number   // made + bonus
  shortMade: number
  longMade: number
  perfectRounds: number
}
