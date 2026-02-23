import { WsEvent } from '../types/index.js'

// Map of leagueNightId -> Set of WebSocket connections
const rooms = new Map<string, Set<WebSocket>>()

export function joinRoom(leagueNightId: string, ws: WebSocket) {
  if (!rooms.has(leagueNightId)) rooms.set(leagueNightId, new Set())
  rooms.get(leagueNightId)!.add(ws)
}

export function leaveRoom(leagueNightId: string, ws: WebSocket) {
  rooms.get(leagueNightId)?.delete(ws)
}

export function broadcastToRoom<T>(leagueNightId: string, event: WsEvent<T>) {
  const sockets = rooms.get(leagueNightId)
  if (!sockets) return

  const message = JSON.stringify(event)
  for (const ws of sockets) {
    if ((ws as any).readyState === 1 /* OPEN */) {
      ws.send(message)
    } else {
      sockets.delete(ws)
    }
  }
}

export function getRoomSize(leagueNightId: string): number {
  return rooms.get(leagueNightId)?.size ?? 0
}
