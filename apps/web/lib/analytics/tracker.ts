/**
 * tracker.ts
 *
 * Client-side anonymous event tracking for Dhun game analytics.
 * Zero tracking on /analytics admin pages.
 */

export type AnalyticsEventType = 'page_view' | 'heartbeat' | 'game_start' | 'guess' | 'game_finish'

export interface EventMetadata {
  era?: string | null
  attempt?: number
  result?: 'correct' | 'wrong' | 'skipped'
  attemptsUsed?: number
  guessedCorrectly?: boolean
  score?: number
  songTitle?: string
  referrer?: string
  [key: string]: unknown
}

function getOrSetVisitorId(): string {
  if (typeof window === 'undefined') return ''
  const KEY = 'dhun_vid'
  let vid = localStorage.getItem(KEY)
  if (!vid) {
    vid = 'v_' + Math.random().toString(36).substring(2, 12) + Date.now().toString(36)
    localStorage.setItem(KEY, vid)
  }
  return vid
}

function getOrSetSessionId(): string {
  if (typeof window === 'undefined') return ''
  const KEY = 'dhun_sid'
  const EXP_KEY = 'dhun_sid_exp'
  const now = Date.now()
  const exp = Number(sessionStorage.getItem(EXP_KEY) || 0)

  let sid = sessionStorage.getItem(KEY)
  // 30 minute session expiration
  if (!sid || now > exp) {
    sid = 's_' + Math.random().toString(36).substring(2, 12) + Date.now().toString(36)
    sessionStorage.setItem(KEY, sid)
  }
  sessionStorage.setItem(EXP_KEY, String(now + 30 * 60 * 1000))
  return sid
}

/** Sends an analytics event beacon to /api/analytics/track */
export function trackEvent(eventType: AnalyticsEventType, metadata: EventMetadata = {}): void {
  if (typeof window === 'undefined') return

  // Do NOT track admin on the analytics dashboard itself
  const path = window.location.pathname
  if (path.startsWith('/analytics')) return

  const payload = {
    visitorId: getOrSetVisitorId(),
    sessionId: getOrSetSessionId(),
    eventType,
    path,
    metadata: {
      ...metadata,
      referrer: document.referrer || undefined,
    },
    timestamp: Date.now(),
  }

  try {
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/analytics/track', blob)
    } else {
      fetch('/api/analytics/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {})
    }
  } catch {
    // Analytics failures must never break the game experience
  }
}

let heartbeatTimer: NodeJS.Timeout | null = null

/** Initializes automatic pageview tracking and active-user heartbeat */
export function initAnalytics(): () => void {
  if (typeof window === 'undefined') return () => {}

  // Initial page view
  trackEvent('page_view')

  // Send heartbeat every 45s while user has the tab open and visible
  if (heartbeatTimer) clearInterval(heartbeatTimer)
  heartbeatTimer = setInterval(() => {
    if (document.visibilityState === 'visible') {
      trackEvent('heartbeat')
    }
  }, 45_000)

  return () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
  }
}

export function trackGameStart(era?: string | null): void {
  trackEvent('game_start', { era: era ?? 'all' })
}

export function trackGuess(
  attempt: number,
  result: 'correct' | 'wrong' | 'skipped',
  guessTitle?: string,
): void {
  trackEvent('guess', {
    attempt,
    result,
    songTitle: guessTitle || undefined,
  })
}

export function trackGameFinish(
  guessedCorrectly: boolean,
  attemptsUsed: number,
  score: number,
  era?: string | null,
  canonicalTitle?: string,
): void {
  trackEvent('game_finish', {
    guessedCorrectly,
    attemptsUsed,
    score,
    era: era ?? 'all',
    songTitle: canonicalTitle,
  })
}
