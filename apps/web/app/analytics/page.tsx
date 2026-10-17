'use client'

import { useEffect, useState, useCallback } from 'react'

interface AnalyticsStats {
  activeUsers: number
  todayUniqueUsers: number
  sevenDayUniqueUsers: number
  totalUniqueUsers: number
  todayPageViews: number
  totalPageViews: number
  playedUsers: number
  conversionRate: number
  totalRoundsStarted: number
  totalRoundsFinished: number
  totalGuesses: number
  correctGuesses: number
  wrongGuesses: number
  skippedGuesses: number
  winRate: number
  attemptDistribution: [number, number, number, number, number, number, number]
  eraDistribution: Record<string, number>
  recentEvents: Array<{
    id: string
    eventType: string
    time: string
    details: string
  }>
}

export default function AnalyticsPage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [stats, setStats] = useState<AnalyticsStats | null>(null)
  const [isLoadingStats, setIsLoadingStats] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<string>('')

  // Check auth status on mount
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/analytics/auth')
        if (res.ok) {
          setIsAuthenticated(true)
          fetchStats()
        } else {
          setIsAuthenticated(false)
        }
      } catch {
        setIsAuthenticated(false)
      }
    }
    checkAuth()
  }, [])

  const fetchStats = useCallback(async () => {
    setIsLoadingStats(true)
    try {
      const res = await fetch('/api/analytics/stats')
      if (res.ok) {
        const data = (await res.json()) as AnalyticsStats
        setStats(data)
        setLastUpdated(
          new Date().toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
        )
      } else if (res.status === 401) {
        setIsAuthenticated(false)
      }
    } catch (err) {
      console.error('Failed to load stats:', err)
    } finally {
      setIsLoadingStats(false)
    }
  }, [])

  // Auto-refresh interval (15s)
  useEffect(() => {
    if (!isAuthenticated || !autoRefresh) return
    const interval = setInterval(fetchStats, 15_000)
    return () => clearInterval(interval)
  }, [isAuthenticated, autoRefresh, fetchStats])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password.trim()) return

    setIsSubmitting(true)
    setAuthError('')

    try {
      const res = await fetch('/api/analytics/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password.trim() }),
      })

      if (res.ok) {
        setIsAuthenticated(true)
        setPassword('')
        fetchStats()
      } else {
        const data = await res.json().catch(() => ({}))
        setAuthError(data.error || 'Incorrect passcode. Access denied.')
      }
    } catch {
      setAuthError('Connection error. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleLogout = async () => {
    await fetch('/api/analytics/auth', { method: 'DELETE' })
    setIsAuthenticated(false)
    setStats(null)
  }

  // ── Render: Loading initial state ──────────────────────────────────────────
  if (isAuthenticated === null) {
    return (
      <div style={styles.centerContainer}>
        <div style={styles.spinner} />
      </div>
    )
  }

  // ── Render: Password Gate ──────────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <div style={styles.authWrapper}>
        <div style={styles.authCard}>
          <div style={styles.authHeader}>
            <div style={styles.shieldIcon}>🔒</div>
            <h1 style={styles.authTitle}>Dhun Analytics</h1>
            <p style={styles.authSubtitle}>Restricted Administrative Access</p>
          </div>

          <form onSubmit={handleLogin} style={styles.authForm}>
            <div style={styles.inputGroup}>
              <label htmlFor="analytics-pass" style={styles.inputLabel}>
                ADMIN PASSCODE
              </label>
              <input
                id="analytics-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter access key…"
                style={styles.passwordInput}
                autoFocus
              />
            </div>

            {authError && <div style={styles.errorBanner}>{authError}</div>}

            <button
              type="submit"
              disabled={isSubmitting || !password}
              style={{
                ...styles.unlockBtn,
                opacity: isSubmitting || !password ? 0.6 : 1,
              }}
            >
              {isSubmitting ? 'Authenticating…' : 'Unlock Dashboard →'}
            </button>
          </form>

          <p style={styles.authFooter}>Protected by Dhun Security Core</p>
        </div>
      </div>
    )
  }

  // ── Render: Main Dashboard ─────────────────────────────────────────────────
  const attemptLabels = [
    'Clip 1 (0.2s)',
    'Clip 2 (0.5s)',
    'Clip 3 (1.0s)',
    'Clip 4 (2.0s)',
    'Clip 5 (4.0s)',
    'Clip 6 (8.0s)',
    'Gave Up',
  ]
  const maxAttemptCount = Math.max(...(stats?.attemptDistribution || [1]), 1)
  const eraEntries = Object.entries(stats?.eraDistribution || {})
  const totalEraCount = eraEntries.reduce((acc, [, c]) => acc + c, 0) || 1

  return (
    <div style={styles.dashContainer}>
      {/* ── Top Header ────────────────────────────────────────── */}
      <header style={styles.topHeader}>
        <div style={styles.headerLeft}>
          <div style={styles.logoRow}>
            <span style={styles.brandBadge}>DHUN</span>
            <h1 style={styles.dashTitle}>Analytics & Telemetry</h1>
          </div>
          <div style={styles.liveIndicatorRow}>
            <span style={styles.pulsingDot} />
            <span style={styles.liveText}>
              <strong style={{ color: '#10b981' }}>{stats?.activeUsers ?? 0}</strong> Active Players
              Now
            </span>
            {lastUpdated && <span style={styles.updateTime}>Synced {lastUpdated}</span>}
          </div>
        </div>

        <div style={styles.headerControls}>
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            style={{
              ...styles.controlBtn,
              background: autoRefresh ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.06)',
              borderColor: autoRefresh ? '#10b981' : 'rgba(255, 255, 255, 0.1)',
              color: autoRefresh ? '#10b981' : '#8892b0',
            }}
          >
            Auto-refresh: {autoRefresh ? '15s' : 'Off'}
          </button>

          <button
            onClick={fetchStats}
            disabled={isLoadingStats}
            style={styles.refreshBtn}
            title="Refresh metrics"
          >
            {isLoadingStats ? '↻ Loading…' : '↻ Refresh'}
          </button>

          <button onClick={handleLogout} style={styles.logoutBtn}>
            Log Out
          </button>
        </div>
      </header>

      {/* ── KPI Cards Grid ────────────────────────────────────── */}
      <section style={styles.kpiGrid}>
        {/* Card 1: Active & Live */}
        <div style={styles.kpiCard}>
          <div style={styles.kpiHeader}>
            <span style={styles.kpiLabel}>ACTIVE PLAYERS</span>
            <span style={styles.kpiIcon}>⚡</span>
          </div>
          <div style={styles.kpiValueRow}>
            <span style={{ ...styles.kpiMainValue, color: '#10b981' }}>
              {stats?.activeUsers ?? 0}
            </span>
          </div>
          <div style={styles.kpiMeta}>Active in last 5 minutes</div>
        </div>

        {/* Card 2: Unique Users */}
        <div style={styles.kpiCard}>
          <div style={styles.kpiHeader}>
            <span style={styles.kpiLabel}>UNIQUE USERS</span>
            <span style={styles.kpiIcon}>👥</span>
          </div>
          <div style={styles.kpiValueRow}>
            <span style={{ ...styles.kpiMainValue, color: '#00f2fe' }}>
              {stats?.totalUniqueUsers ?? 0}
            </span>
          </div>
          <div style={styles.kpiSubValues}>
            <span>
              Today: <strong>{stats?.todayUniqueUsers ?? 0}</strong>
            </span>
            <span>•</span>
            <span>
              7d: <strong>{stats?.sevenDayUniqueUsers ?? 0}</strong>
            </span>
          </div>
        </div>

        {/* Card 3: Site Accesses */}
        <div style={styles.kpiCard}>
          <div style={styles.kpiHeader}>
            <span style={styles.kpiLabel}>SITE ACCESSES</span>
            <span style={styles.kpiIcon}>🌐</span>
          </div>
          <div style={styles.kpiValueRow}>
            <span style={{ ...styles.kpiMainValue, color: '#a78bfa' }}>
              {stats?.totalPageViews ?? 0}
            </span>
          </div>
          <div style={styles.kpiMeta}>
            Today: <strong>{stats?.todayPageViews ?? 0}</strong> total views
          </div>
        </div>

        {/* Card 4: Player Conversion */}
        <div style={styles.kpiCard}>
          <div style={styles.kpiHeader}>
            <span style={styles.kpiLabel}>ACTUALLY PLAYED</span>
            <span style={styles.kpiIcon}>🎯</span>
          </div>
          <div style={styles.kpiValueRow}>
            <span style={{ ...styles.kpiMainValue, color: '#f59e0b' }}>
              {stats?.conversionRate ?? 0}%
            </span>
          </div>
          <div style={styles.kpiMeta}>
            <strong>{stats?.playedUsers ?? 0}</strong> of {stats?.totalUniqueUsers ?? 0} visitors
            played
          </div>
        </div>

        {/* Card 5: Songs Played */}
        <div style={styles.kpiCard}>
          <div style={styles.kpiHeader}>
            <span style={styles.kpiLabel}>ROUNDS PLAYED</span>
            <span style={styles.kpiIcon}>🎵</span>
          </div>
          <div style={styles.kpiValueRow}>
            <span style={{ ...styles.kpiMainValue, color: '#ec4899' }}>
              {stats?.totalRoundsStarted ?? 0}
            </span>
          </div>
          <div style={styles.kpiMeta}>
            Finished: <strong>{stats?.totalRoundsFinished ?? 0}</strong> rounds
          </div>
        </div>

        {/* Card 6: Win Rate & Accuracy */}
        <div style={styles.kpiCard}>
          <div style={styles.kpiHeader}>
            <span style={styles.kpiLabel}>WIN RATE</span>
            <span style={styles.kpiIcon}>🏆</span>
          </div>
          <div style={styles.kpiValueRow}>
            <span style={{ ...styles.kpiMainValue, color: '#38bdf8' }}>{stats?.winRate ?? 0}%</span>
          </div>
          <div style={styles.kpiSubValues}>
            <span style={{ color: '#10b981' }}>✓ {stats?.correctGuesses ?? 0}</span>
            <span>•</span>
            <span style={{ color: '#ef4444' }}>✕ {stats?.wrongGuesses ?? 0}</span>
            <span>•</span>
            <span style={{ color: '#94a3b8' }}>⏭ {stats?.skippedGuesses ?? 0}</span>
          </div>
        </div>
      </section>

      {/* ── Deep Analytics Panels ─────────────────────────────── */}
      <div style={styles.panelsGrid}>
        {/* Panel 1: Attempt Distribution */}
        <section style={styles.panelCard}>
          <div style={styles.panelHeader}>
            <h2 style={styles.panelTitle}>Guess Attempt Breakdown</h2>
            <span style={styles.panelSubtitle}>Which clip unlocks the answer?</span>
          </div>

          <div style={styles.distributionList}>
            {(stats?.attemptDistribution || [0, 0, 0, 0, 0, 0, 0]).map((count, idx) => {
              const pct = maxAttemptCount > 0 ? Math.round((count / maxAttemptCount) * 100) : 0
              const isGaveUp = idx === 6
              const barColor = isGaveUp
                ? '#ef4444'
                : idx <= 1
                  ? '#10b981'
                  : idx <= 3
                    ? '#00f2fe'
                    : '#f59e0b'

              return (
                <div key={idx} style={styles.distRow}>
                  <div style={styles.distLabelCol}>
                    <span style={{ ...styles.distLabel, color: isGaveUp ? '#f87171' : '#e2e8f0' }}>
                      {attemptLabels[idx]}
                    </span>
                    <span style={styles.distCount}>{count}</span>
                  </div>
                  <div style={styles.barTrack}>
                    <div
                      style={{
                        ...styles.barFill,
                        width: `${Math.max(pct, count > 0 ? 4 : 0)}%`,
                        background: barColor,
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Panel 2: Era Popularity */}
        <section style={styles.panelCard}>
          <div style={styles.panelHeader}>
            <h2 style={styles.panelTitle}>Era Popularity</h2>
            <span style={styles.panelSubtitle}>Rounds played by musical era</span>
          </div>

          <div style={styles.distributionList}>
            {eraEntries.length === 0 ? (
              <div style={styles.emptyState}>No era data collected yet.</div>
            ) : (
              eraEntries.map(([era, count]) => {
                const pct = Math.round((count / totalEraCount) * 100)
                return (
                  <div key={era} style={styles.distRow}>
                    <div style={styles.distLabelCol}>
                      <span style={styles.distLabel}>{era.toUpperCase()}</span>
                      <span style={styles.distCount}>
                        {count} ({pct}%)
                      </span>
                    </div>
                    <div style={styles.barTrack}>
                      <div
                        style={{
                          ...styles.barFill,
                          width: `${pct}%`,
                          background: 'linear-gradient(90deg, #6366f1, #a855f7)',
                        }}
                      />
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </section>
      </div>

      {/* ── Live Event Stream ─────────────────────────────────── */}
      <section style={styles.panelCard}>
        <div style={styles.panelHeader}>
          <h2 style={styles.panelTitle}>Live Game Stream</h2>
          <span style={styles.panelSubtitle}>Real-time player actions & guesses</span>
        </div>

        <div style={styles.eventTableWrapper}>
          {stats?.recentEvents?.length === 0 ? (
            <div style={styles.emptyState}>Waiting for live game events…</div>
          ) : (
            <div style={styles.streamList}>
              {stats?.recentEvents?.map((evt) => (
                <div key={evt.id} style={styles.streamItem}>
                  <span style={styles.streamTime}>{evt.time}</span>
                  <span
                    style={{
                      ...styles.streamBadge,
                      ...getBadgeStyle(evt.eventType),
                    }}
                  >
                    {formatEventType(evt.eventType)}
                  </span>
                  <span style={styles.streamDetails}>{evt.details}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────── */}
      <footer style={styles.dashFooter}>
        <span>Dhun Analytics v2.0 • Secured Admin Portal</span>
        <span>•</span>
        <span>Auto-syncs with Neon Postgres & Local Telemetry</span>
      </footer>
    </div>
  )
}

function formatEventType(type: string): string {
  switch (type) {
    case 'game_finish':
      return 'FINISH'
    case 'game_start':
      return 'START'
    case 'guess':
      return 'GUESS'
    case 'page_view':
      return 'VISIT'
    default:
      return 'PING'
  }
}

function getBadgeStyle(type: string): React.CSSProperties {
  switch (type) {
    case 'game_finish':
      return {
        background: 'rgba(168, 85, 247, 0.2)',
        color: '#c084fc',
        border: '1px solid rgba(168, 85, 247, 0.4)',
      }
    case 'game_start':
      return {
        background: 'rgba(56, 189, 248, 0.2)',
        color: '#38bdf8',
        border: '1px solid rgba(56, 189, 248, 0.4)',
      }
    case 'guess':
      return {
        background: 'rgba(245, 158, 11, 0.2)',
        color: '#fbbf24',
        border: '1px solid rgba(245, 158, 11, 0.4)',
      }
    case 'page_view':
      return {
        background: 'rgba(16, 185, 129, 0.2)',
        color: '#34d399',
        border: '1px solid rgba(16, 185, 129, 0.4)',
      }
    default:
      return {
        background: 'rgba(148, 163, 184, 0.2)',
        color: '#94a3b8',
        border: '1px solid rgba(148, 163, 184, 0.3)',
      }
  }
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  centerContainer: {
    minHeight: '100dvh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#090d16',
  },
  spinner: {
    width: 44,
    height: 44,
    border: '3px solid rgba(255, 255, 255, 0.1)',
    borderTopColor: '#00f2fe',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  authWrapper: {
    minHeight: '100dvh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'radial-gradient(circle at 50% 20%, #151d30 0%, #080c14 100%)',
    padding: 20,
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  authCard: {
    width: '100%',
    maxWidth: 420,
    background: 'rgba(18, 24, 38, 0.85)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    padding: '36px 28px',
    boxShadow: '0 24px 60px rgba(0, 0, 0, 0.6), 0 0 40px rgba(0, 242, 254, 0.08)',
    backdropFilter: 'blur(20px)',
    textAlign: 'center',
  },
  authHeader: {
    marginBottom: 28,
  },
  shieldIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  authTitle: {
    margin: '0 0 6px',
    fontSize: '1.75rem',
    fontWeight: 800,
    color: '#ffffff',
    letterSpacing: '-0.02em',
  },
  authSubtitle: {
    margin: 0,
    fontSize: '0.85rem',
    color: '#94a3b8',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  authForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  inputGroup: {
    textAlign: 'left',
  },
  inputLabel: {
    display: 'block',
    fontSize: '0.7rem',
    fontWeight: 700,
    color: '#00f2fe',
    letterSpacing: '0.08em',
    marginBottom: 8,
  },
  passwordInput: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '14px 16px',
    background: 'rgba(10, 14, 24, 0.8)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: 12,
    color: '#ffffff',
    fontSize: '1rem',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  errorBanner: {
    padding: '10px 14px',
    background: 'rgba(239, 68, 68, 0.15)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: 8,
    color: '#fca5a5',
    fontSize: '0.82rem',
  },
  unlockBtn: {
    padding: '14px',
    background: 'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)',
    border: 'none',
    borderRadius: 12,
    color: '#051124',
    fontSize: '0.95rem',
    fontWeight: 800,
    cursor: 'pointer',
    letterSpacing: '0.02em',
    transition: 'transform 0.15s',
  },
  authFooter: {
    margin: '24px 0 0',
    fontSize: '0.72rem',
    color: '#64748b',
    letterSpacing: '0.05em',
  },

  // Dashboard Styles
  dashContainer: {
    minHeight: '100dvh',
    background: '#080c14',
    color: '#f1f5f9',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    padding: '24px 20px 60px',
    maxWidth: 1280,
    margin: '0 auto',
  },
  topHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 16,
    paddingBottom: 24,
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    marginBottom: 24,
  },
  headerLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  brandBadge: {
    padding: '4px 10px',
    background: 'linear-gradient(135deg, #00f2fe, #4facfe)',
    color: '#051124',
    borderRadius: 6,
    fontSize: '0.75rem',
    fontWeight: 900,
    letterSpacing: '0.06em',
  },
  dashTitle: {
    margin: 0,
    fontSize: '1.6rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
  },
  liveIndicatorRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: '0.85rem',
    color: '#94a3b8',
  },
  pulsingDot: {
    width: 9,
    height: 9,
    borderRadius: '50%',
    background: '#10b981',
    boxShadow: '0 0 10px #10b981',
    display: 'inline-block',
  },
  liveText: {
    color: '#cbd5e1',
  },
  updateTime: {
    fontSize: '0.75rem',
    color: '#64748b',
    marginLeft: 6,
  },
  headerControls: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  controlBtn: {
    padding: '8px 14px',
    borderRadius: 8,
    fontSize: '0.78rem',
    fontWeight: 600,
    border: '1px solid',
    cursor: 'pointer',
  },
  refreshBtn: {
    padding: '8px 14px',
    borderRadius: 8,
    fontSize: '0.78rem',
    fontWeight: 600,
    background: 'rgba(255, 255, 255, 0.08)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    color: '#e2e8f0',
    cursor: 'pointer',
  },
  logoutBtn: {
    padding: '8px 14px',
    borderRadius: 8,
    fontSize: '0.78rem',
    fontWeight: 600,
    background: 'rgba(239, 68, 68, 0.12)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    color: '#f87171',
    cursor: 'pointer',
  },

  // KPI Grid
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 16,
    marginBottom: 24,
  },
  kpiCard: {
    background: 'rgba(18, 24, 38, 0.7)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    padding: '18px 20px',
    backdropFilter: 'blur(12px)',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  kpiHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kpiLabel: {
    fontSize: '0.68rem',
    fontWeight: 700,
    letterSpacing: '0.08em',
    color: '#94a3b8',
  },
  kpiIcon: {
    fontSize: '1rem',
  },
  kpiValueRow: {
    margin: '2px 0',
  },
  kpiMainValue: {
    fontSize: '2rem',
    fontWeight: 900,
    lineHeight: 1,
    letterSpacing: '-0.03em',
  },
  kpiMeta: {
    fontSize: '0.78rem',
    color: '#64748b',
  },
  kpiSubValues: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: '0.78rem',
    color: '#64748b',
  },

  // Panels
  panelsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: 20,
    marginBottom: 24,
  },
  panelCard: {
    background: 'rgba(18, 24, 38, 0.7)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    padding: '22px 24px',
    backdropFilter: 'blur(12px)',
    marginBottom: 24,
  },
  panelHeader: {
    marginBottom: 18,
  },
  panelTitle: {
    margin: '0 0 4px',
    fontSize: '1.1rem',
    fontWeight: 800,
    letterSpacing: '-0.01em',
    color: '#ffffff',
  },
  panelSubtitle: {
    fontSize: '0.78rem',
    color: '#64748b',
  },
  distributionList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  distRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  distLabelCol: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  distLabel: {
    fontSize: '0.8rem',
    fontWeight: 600,
  },
  distCount: {
    fontSize: '0.8rem',
    fontWeight: 700,
    color: '#94a3b8',
  },
  barTrack: {
    width: '100%',
    height: 8,
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 99,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 99,
    transition: 'width 0.4s ease',
  },
  emptyState: {
    padding: 30,
    textAlign: 'center',
    color: '#64748b',
    fontSize: '0.88rem',
  },

  // Stream List
  eventTableWrapper: {
    maxHeight: 400,
    overflowY: 'auto',
  },
  streamList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  streamItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 14px',
    background: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 8,
    fontSize: '0.82rem',
  },
  streamTime: {
    color: '#64748b',
    fontSize: '0.75rem',
    fontFamily: 'monospace',
    minWidth: 65,
  },
  streamBadge: {
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: '0.68rem',
    fontWeight: 800,
    letterSpacing: '0.04em',
    minWidth: 50,
    textAlign: 'center',
  },
  streamDetails: {
    color: '#e2e8f0',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  dashFooter: {
    marginTop: 32,
    paddingTop: 20,
    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    fontSize: '0.75rem',
    color: '#64748b',
    flexWrap: 'wrap',
  },
}
