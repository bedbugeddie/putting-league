import { useEffect, useRef, useCallback } from 'react'

interface WsOptions {
  onMessage: (event: MessageEvent) => void
  onOpen?: () => void
  onClose?: () => void
  enabled?: boolean
}

const WS_BASE = import.meta.env.VITE_WS_URL ?? (() => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws`
})()

/**
 * Persistent WebSocket hook with automatic reconnect and ping/pong keepalive.
 */
export function useWebSocket(leagueNightId: string | null, options: WsOptions) {
  const wsRef = useRef<WebSocket | null>(null)
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)
  const retryDelayRef = useRef(2_000)

  // Store callbacks in refs so connect() doesn't need them as dependencies.
  // Without this, inline arrow functions cause connect to change every render,
  // which re-runs the effect, closes the in-flight socket, and floods the console.
  const onMessageRef = useRef(options.onMessage)
  const onOpenRef = useRef(options.onOpen)
  const onCloseRef = useRef(options.onClose)
  onMessageRef.current = options.onMessage
  onOpenRef.current = options.onOpen
  onCloseRef.current = options.onClose

  const { enabled = true } = options

  const connect = useCallback(() => {
    if (!leagueNightId || !enabled || !mountedRef.current) return

    const ws = new WebSocket(`${WS_BASE}/${leagueNightId}`)
    wsRef.current = ws

    ws.onopen = () => {
      retryDelayRef.current = 2_000 // reset backoff on successful connect
      onOpenRef.current?.()
      // Send ping every 30s to keep connection alive
      pingRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'PING' }))
        }
      }, 30_000)
    }

    ws.onmessage = (e) => onMessageRef.current(e)

    ws.onclose = () => {
      onCloseRef.current?.()
      if (pingRef.current) clearInterval(pingRef.current)
      // Reconnect with exponential backoff (cap at 30s)
      if (mountedRef.current) {
        reconnectRef.current = setTimeout(() => {
          retryDelayRef.current = Math.min(retryDelayRef.current * 2, 30_000)
          connect()
        }, retryDelayRef.current)
      }
    }

    ws.onerror = () => ws.close()
  }, [leagueNightId, enabled])

  useEffect(() => {
    mountedRef.current = true
    retryDelayRef.current = 2_000
    connect()

    return () => {
      mountedRef.current = false
      if (pingRef.current) clearInterval(pingRef.current)
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      wsRef.current?.close()
    }
  }, [connect])

  return wsRef
}
