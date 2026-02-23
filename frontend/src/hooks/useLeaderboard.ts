import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useWebSocket } from './useWebSocket'
import { api } from '../api/client'
import type { LeaderboardResponse } from '../api/types'

/**
 * Fetches leaderboard via HTTP and then patches it live via WebSocket events.
 */
export function useLeaderboard(leagueNightId: string | null) {
  const queryClient = useQueryClient()
  const [connected, setConnected] = useState(false)

  const query = useQuery<LeaderboardResponse>({
    queryKey: ['leaderboard', leagueNightId],
    queryFn: () => api.get<LeaderboardResponse>(`/league-nights/${leagueNightId}/leaderboard`),
    enabled: !!leagueNightId,
    refetchInterval: 60_000, // fallback poll every 60s
  })

  const onMessage = useCallback((event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data)
      if (msg.type === 'LEADERBOARD_UPDATED' || msg.type === 'SCORE_UPDATED') {
        if (msg.payload?.leaderboard) {
          // Directly update query cache with server-pushed data
          queryClient.setQueryData(['leaderboard', leagueNightId], (old: LeaderboardResponse | undefined) => {
            const totals: LeaderboardResponse['overall'] = msg.payload.leaderboard
            const byDivision: Record<string, typeof totals> = {}
            for (const t of totals) {
              if (!byDivision[t.divisionCode]) byDivision[t.divisionCode] = []
              byDivision[t.divisionCode].push(t)
            }
            return { overall: totals, byDivision }
          })
        }
      }
    } catch {
      // ignore
    }
  }, [leagueNightId, queryClient])

  useWebSocket(leagueNightId, {
    onMessage,
    onOpen: () => setConnected(true),
    onClose: () => setConnected(false),
    enabled: !!leagueNightId,
  })

  return { ...query, connected }
}
