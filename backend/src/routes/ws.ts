import { FastifyInstance } from 'fastify'
import { joinRoom, leaveRoom, broadcastToRoom, getRoomSize } from '../plugins/websocket.js'

/**
 * WebSocket endpoint – clients connect to /ws/:leagueNightId
 * and receive real-time score / leaderboard updates for that night.
 */
export async function wsRoutes(app: FastifyInstance) {
  app.get(
    '/ws/:leagueNightId',
    { websocket: true },
    (socket, req) => {
      const { leagueNightId } = req.params as { leagueNightId: string }

      // Register this socket in the room
      joinRoom(leagueNightId, socket as unknown as WebSocket)

      // Send welcome + current viewer count
      socket.send(JSON.stringify({
        type: 'CONNECTED',
        leagueNightId,
        viewerCount: getRoomSize(leagueNightId),
      }))

      // Relay ping/pong for keepalive
      socket.on('message', (raw: Buffer) => {
        try {
          const msg = JSON.parse(raw.toString())
          if (msg.type === 'PING') {
            socket.send(JSON.stringify({ type: 'PONG' }))
          }
        } catch {
          // ignore non-JSON messages
        }
      })

      socket.on('close', () => {
        leaveRoom(leagueNightId, socket as unknown as WebSocket)
      })

      socket.on('error', () => {
        leaveRoom(leagueNightId, socket as unknown as WebSocket)
      })
    }
  )
}
