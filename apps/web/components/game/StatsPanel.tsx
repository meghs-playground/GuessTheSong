'use client'

import type { SessionStats } from '@dhun/shared'

interface StatsPanelProps {
  stats: SessionStats
  onClose: () => void
}

export function StatsPanel({ stats, onClose }: StatsPanelProps) {
  const avgAttempts =
    stats.roundsGuessed > 0 ? (stats.totalAttempts / stats.roundsGuessed).toFixed(1) : '–'

  const guessRate =
    stats.roundsPlayed > 0 ? Math.round((stats.roundsGuessed / stats.roundsPlayed) * 100) : 0

  const maxDist = Math.max(...stats.attemptDistribution, 1)

  return (
    <div
      className="card"
      style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 20 }}
      role="dialog"
      aria-label="Your stats"
      aria-modal="true"
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900 }}>Your Stats</h2>
        <button
          onClick={onClose}
          className="btn"
          style={{
            background: '#efbdeb',
            width: 36,
            height: 36,
            fontSize: '1rem',
            fontWeight: 900,
          }}
          aria-label="Close stats"
        >
          ✕
        </button>
      </div>

      {/* Summary grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {[
          { label: 'Played', value: stats.roundsPlayed },
          { label: 'Win %', value: `${guessRate}%` },
          { label: 'Streak', value: stats.currentStreak },
          { label: 'Best', value: stats.bestStreak },
        ].map(({ label, value }) => (
          <div
            key={label}
            style={{
              background: '#a7e2e3',
              border: '3px solid #000',
              boxShadow: '2px 2px 0 #000',
              padding: '12px 8px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            <span style={{ fontSize: '1.6rem', fontWeight: 900, lineHeight: 1 }}>{value}</span>
            <span
              style={{
                fontSize: '0.65rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                opacity: 0.6,
              }}
            >
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* Attempt distribution */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <p
          style={{
            margin: 0,
            fontSize: '0.7rem',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
          }}
        >
          Guess distribution
        </p>
        {stats.attemptDistribution.map((count, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 16,
                fontWeight: 800,
                fontSize: '0.8rem',
                textAlign: 'center',
                flexShrink: 0,
              }}
            >
              {idx + 1}
            </span>
            <div
              style={{
                flex: 1,
                height: 24,
                background: '#f0f0f0',
                border: '2px solid #000',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {count > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    inset: '0 auto 0 0',
                    width: `${Math.max((count / maxDist) * 100, 12)}%`,
                    background: '#5f7367',
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: 6,
                    color: '#fff',
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    transition: 'width 300ms ease',
                  }}
                >
                  {count}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <p
        style={{
          margin: 0,
          fontSize: '0.75rem',
          textAlign: 'center',
          opacity: 0.5,
          fontWeight: 600,
        }}
      >
        Avg attempts when correct: {avgAttempts}
      </p>
    </div>
  )
}
