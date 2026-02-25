// Shared TypeScript types mirroring the backend Prisma models

export type LeagueStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
export type TieBreakerMode = 'SPLIT' | 'PUTT_OFF'
export type Position = 'SHORT' | 'LONG'

export interface User {
  id: string
  email: string
  name: string
  isAdmin: boolean
  player?: Player
}

export interface Division {
  id: string
  code: string
  name: string
  description?: string
  sortOrder: number
  isActive: boolean
  _count?: { players: number }
}

export interface Player {
  id: string
  userId: string
  divisionId: string
  isActive: boolean
  user: User
  division: Division
}

export interface Season {
  id: string
  name: string
  startDate: string
  endDate?: string
  isActive: boolean
  _count?: { leagueNights: number }
}

export interface Hole {
  id: string
  leagueNightId: string
  number: number
  shortDistance?: number
  longDistance?: number
}

export interface Round {
  id: string
  leagueNightId: string
  number: number
  isComplete: boolean
}

export interface ScorekeeperAssignment {
  id: string
  userId: string
  user: { name: string; email: string }
}

export interface LeagueNight {
  id: string
  seasonId: string
  season: Season
  date: string
  status: LeagueStatus
  tieBreakerMode: TieBreakerMode
  notes?: string
  holes: Hole[]
  rounds: Round[]
  scorekeeperAssignments?: ScorekeeperAssignment[]
  _count?: { rounds: number; holes: number }
}

export interface Score {
  id: string
  playerId: string
  holeId: string
  roundId: string
  position: Position
  made: number
  bonus: boolean
  player?: Player
  hole?: Hole
  round?: Round
}

export interface PlayerTotals {
  playerId: string
  playerName: string
  divisionId: string
  divisionCode: string
  totalMade: number
  totalBonus: number
  totalScore: number
  shortMade: number
  longMade: number
  perfectRounds: number
}

export interface LeaderboardResponse {
  overall: PlayerTotals[]
  byDivision: Record<string, PlayerTotals[]>
}

export interface PuttOffParticipant {
  id: string
  playerId: string
  round: number
  made: number
  bonus: boolean
  player: Player
}

export interface PuttOff {
  id: string
  leagueNightId: string
  divisionId: string
  round: number
  winnerId?: string
  participants: PuttOffParticipant[]
}

export interface PlayerStats {
  playerId: string
  totalAttempts: number
  totalMade: number
  totalBonus: number
  totalScore: number
  highestNight: number
  avgPerNight: number
  shortAccuracy: number
  longAccuracy: number
  nightsPlayed: number
}

export interface CheckIn {
  id: string
  leagueNightId: string
  playerId: string
  checkedInAt: string
  player: Player
}

export interface CardPlayer {
  id: string
  cardId: string
  playerId: string
  player: Player
}

export interface Card {
  id: string
  leagueNightId: string
  name: string
  startingHole: number
  scorekeeperId?: string | null
  scorekeeper?: Player | null
  players: CardPlayer[]
}

export interface NightHistory {
  leagueNightId: string
  date: string
  seasonName: string
  totalScore: number
  bonuses: number
}

export interface NightHighlights {
  mostBonuses: { playerName: string; divisionCode: string; count: number } | null
  longestStreak: { playerName: string; divisionCode: string; streak: number } | null
  mostImproved: { playerName: string; divisionCode: string; delta: number; previous: number; current: number } | null
  perfectRounders: { playerName: string; divisionCode: string; roundNumber: number }[]
}
