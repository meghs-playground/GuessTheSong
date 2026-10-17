'use client'

import type { SessionStats } from '@dhun/shared'
import { MAX_ATTEMPTS } from '@dhun/shared'

interface StatsPanelProps {
  stats: SessionStats
  onClose: () => void
}

export function StatsPanel({ stats, onClose }: StatsPanelProps) {
  const avgAttempts =
    stats.roundsGuessed > 0
      ? (stats.totalAttempts / stats.roundsGuessed).toFixed(1)
      : '–'

  const guessRate =
    stats.roundsPlayed > 0
      ? Math.round((stats.roundsGuessed / stats.roundsPlayed) * 100)
      : 0

  const maxDist = Math.max(...stats.attemptDistribution, 1)

  return (
    <div
      className="brutal-border brutal-shadow bg-[var(--color-paper)] p-5 flex flex-col gap-4"
      role="dialog"
      aria-label="Your stats"
      aria-modal="true"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black">Your Stats</h2>
        <button
          onClick={onClose}
          className="brutal-btn bg-[var(--color-orchid)] w-8 h-8 font-black text-sm flex items-center justify-center"
          aria-label="Close stats"
        >
          ✕
        </button>
      </div>

      {/* Summary numbers */}
      <div className="grid grid-cols-4 gap-3 text-center">
        {[
          { label: 'Played', value: stats.roundsPlayed },
          { label: 'Win%', value: `${guessRate}%` },
          { label: 'Streak', value: stats.currentStreak },
          { label: 'Best', value: stats.bestStreak },
        ].map(({ label, value }) => (
          <div key={label} className="flex flex-col">
            <span className="text-2xl font-black">{value}</span>
            <span className="text-xs font-medium text-gray-500">{label}</span>
          </div>
        ))}
      </div>

      {/* Attempt distribution */}
      <div className="flex flex-col gap-1">
        <p className="text-sm font-bold">Attempt distribution</p>
        {stats.attemptDistribution.map((count, idx) => (
          <div key={idx} className="flex items-center gap-2 text-sm">
            <span className="w-4 font-bold shrink-0">{idx + 1}</span>
            <div className="flex-1 h-6 bg-gray-100 brutal-border brutal-shadow-sm relative overflow-hidden">
              {count > 0 && (
                <div
                  className="absolute inset-y-0 left-0 bg-[var(--color-teal)] flex items-center px-2 text-white text-xs font-bold"
                  style={{ width: `${(count / maxDist) * 100}%` }}
                >
                  {count}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-500 text-center">Avg attempts: {avgAttempts}</p>
    </div>
  )
}
