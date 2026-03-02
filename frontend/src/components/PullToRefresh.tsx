import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react'

const THRESHOLD = 72   // px of pull required to trigger a refresh
const MAX_PULL  = 96   // max visual travel (adds resistance feel)

interface Props {
  onRefresh: () => Promise<void>
  children: ReactNode
}

export default function PullToRefresh({ onRefresh, children }: Props) {
  const [pullY, setPullY]           = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  // Refs for values accessed inside event listeners (avoids stale closures)
  const startY        = useRef(0)
  const pulling       = useRef(false)
  const pullYRef      = useRef(0)
  const refreshingRef = useRef(false)
  const onRefreshRef  = useRef(onRefresh)
  useEffect(() => { onRefreshRef.current = onRefresh }, [onRefresh])

  const triggerRefresh = useCallback(() => {
    refreshingRef.current = true
    setRefreshing(true)
    // Settle the indicator at a comfortable resting position
    const settled = Math.round(THRESHOLD * 0.65)
    pullYRef.current = settled
    setPullY(settled)

    onRefreshRef.current().finally(() => {
      refreshingRef.current = false
      setRefreshing(false)
      pullYRef.current = 0
      setPullY(0)
    })
  }, [])

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      // Only activate when page is scrolled to the very top and not mid-refresh
      if (window.scrollY > 4 || refreshingRef.current) return
      startY.current  = e.touches[0].clientY
      pulling.current = true
    }

    function onTouchMove(e: TouchEvent) {
      if (!pulling.current) return
      const delta = e.touches[0].clientY - startY.current
      if (delta <= 0) {
        // Scrolling up — cancel pull
        pulling.current = false
        pullYRef.current = 0
        setPullY(0)
        return
      }
      // Apply resistance (√ feel): slow pull as it approaches max
      const clamped = Math.min(delta * 0.45, MAX_PULL)
      pullYRef.current = clamped
      setPullY(clamped)
      // Prevent the browser's native scroll/overscroll once we're pulling
      if (delta > 10) e.preventDefault()
    }

    function onTouchEnd() {
      if (!pulling.current) return
      pulling.current = false
      if (pullYRef.current >= THRESHOLD) {
        triggerRefresh()
      } else {
        // Snap back — CSS transition will animate this smoothly
        pullYRef.current = 0
        setPullY(0)
      }
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove',  onTouchMove,  { passive: false })
    window.addEventListener('touchend',   onTouchEnd)
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove',  onTouchMove)
      window.removeEventListener('touchend',   onTouchEnd)
    }
  }, [triggerRefresh])

  // progress 0→1 as pull approaches threshold
  const progress = Math.min(pullY / THRESHOLD, 1)

  // Indicator lives just above the content area (below nav, top: 3.5rem = h-14).
  // It starts 48px above that edge and slides into view as the user pulls.
  const indicatorTranslateY = pullY - 48

  // Only suppress CSS transition while the user is actively dragging.
  // When pull snaps back (pullY → 0) or refresh completes, we want a smooth fade.
  const noTransition = pullY > 0 && !refreshing

  return (
    <>
      {/* Pull indicator — fixed just below the nav bar */}
      <div
        aria-hidden="true"
        className="fixed left-0 right-0 z-40 flex justify-center pointer-events-none"
        style={{
          top: '3.5rem',
          transform: `translateY(${refreshing ? 8 : indicatorTranslateY}px)`,
          opacity: refreshing ? 1 : progress,
          transition: noTransition ? 'none' : 'transform 0.25s ease-out, opacity 0.25s ease-out',
        }}
      >
        <div
          className="w-9 h-9 rounded-full bg-brand-600 dark:bg-brand-500 shadow-lg flex items-center justify-center"
          style={{
            transform: refreshing ? undefined : `rotate(${progress * 270}deg)`,
          }}
        >
          {/* Arrow icon — spins during active refresh */}
          <svg
            className={`w-5 h-5 text-white ${refreshing ? 'animate-spin' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </div>
      </div>

      {children}
    </>
  )
}
