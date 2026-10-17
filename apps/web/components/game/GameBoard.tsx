'use client'

import { useState } from 'react'
import type { Era } from '@dhun/shared'
import { useGame } from '@/hooks/useGame'
import { ClipProgress } from '@/components/ui/ClipProgress'
import { PlayButton } from '@/components/ui/PlayButton'
import { SearchBox } from '@/components/ui/SearchBox'
import { GuessChip } from '@/components/ui/GuessChip'
import { RevealCard } from '@/components/ui/RevealCard'
import { EraFilter } from '@/components/ui/EraFilter'
import { StreakSticker } from '@/components/ui/StreakSticker'
import { StatsPanel } from '@/components/game/StatsPanel'

export function GameBoard() {
  const [era, setEra] = useState<Era | null>(null)
  const [showStats, setShowStats] = useState(false)

  const {
    state,
    stats,
    searchResults,
    startRound,
    playClip,
    stopClip,
    handleSearch,
    submitGuess,
    skip,
    giveUp,
    share,
  } = useGame(era)

  const { phase, currentAttempt, results, guesses, reveal, isPlaying, score, shareStatus } = state
  const isRevealed = phase === 'revealed'
  const isLoading = phase === 'loading'
  const hasStarted = phase !== 'idle'

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        width: '100%',
        maxWidth: 520,
        margin: '0 auto',
        padding: '24px 16px 48px',
      }}
    >
      {/* ── Header ─────────────────────────────────────── */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: '2rem',
              fontWeight: 900,
              letterSpacing: '-0.03em',
              lineHeight: 1,
            }}
          >
            Dhun
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: '0.75rem',
              fontWeight: 600,
              opacity: 0.6,
              letterSpacing: '0.05em',
            }}
          >
            BOLLYWOOD HEARDLE
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <StreakSticker streak={stats.currentStreak} score={score} />
          <button
            onClick={() => setShowStats((v) => !v)}
            className="btn"
            style={{ background: '#fff', padding: '8px 14px', fontSize: '0.8rem' }}
            aria-label="View stats"
            aria-expanded={showStats}
          >
            Stats
          </button>
        </div>
      </header>

      {/* ── Stats panel ────────────────────────────────── */}
      {showStats && <StatsPanel stats={stats} onClose={() => setShowStats(false)} />}

      {/* ── Era filter ─────────────────────────────────── */}
      <div className="card" style={{ padding: '14px 16px' }}>
        <p
          style={{
            margin: '0 0 10px',
            fontSize: '0.7rem',
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Filter by era
        </p>
        <EraFilter selected={era} onChange={setEra} />
      </div>

      {/* ── Idle / start screen ────────────────────────── */}
      {phase === 'idle' && (
        <div
          className="card"
          style={{
            padding: '40px 24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 24,
            textAlign: 'center',
          }}
        >
          <div>
            <p style={{ margin: '0 0 6px', fontSize: '1.25rem', fontWeight: 800 }}>
              🎵 Hear a tiny clip.
            </p>
            <p style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>
              Guess the Bollywood song.
            </p>
            <p style={{ margin: '10px 0 0', fontSize: '0.875rem', opacity: 0.6 }}>
              6 attempts · endless play
            </p>
          </div>
          <button
            onClick={startRound}
            className="btn"
            style={{
              background: '#6bbaec',
              padding: '16px 48px',
              fontSize: '1.25rem',
              fontWeight: 900,
              letterSpacing: '-0.02em',
            }}
          >
            Play →
          </button>
        </div>
      )}

      {/* ── Active round ───────────────────────────────── */}
      {hasStarted && (
        <>
          {/* Clip progress */}
          <ClipProgress
            currentAttempt={currentAttempt}
            results={results}
            isCorrect={results.at(-1) === 'correct'}
          />

          {/* Player */}
          {!isRevealed && (
            <div
              className="card"
              style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}
            >
              <PlayButton
                isPlaying={isPlaying}
                isLoading={isLoading}
                onClick={isPlaying ? stopClip : playClip}
                disabled={isLoading}
              />
              <div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem' }} aria-live="polite">
                  {isLoading ? 'Loading song…' : isPlaying ? 'Playing clip…' : 'Press play'}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: '0.75rem', opacity: 0.55 }}>
                  {isLoading ? '' : `Attempt ${results.length + 1} of 6`}
                </p>
              </div>
            </div>
          )}

          {/* Previous guesses */}
          {guesses.length > 0 && (
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
              role="list"
              aria-label="Previous guesses"
            >
              {guesses.map((g, i) => {
                const r = results[i]
                if (r === 'correct') return null
                return (
                  <GuessChip key={i} title={g || ''} type={r === 'skipped' ? 'skipped' : 'wrong'} />
                )
              })}
            </div>
          )}

          {/* Search + skip/give up */}
          {!isRevealed && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <SearchBox
                results={searchResults}
                onSearch={handleSearch}
                onSelect={submitGuess}
                disabled={isLoading}
                placeholder="Search song, film or artist…"
              />
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={skip}
                  disabled={isLoading}
                  className="btn"
                  style={{ background: '#fff', flex: 1, padding: '10px 0', fontSize: '0.875rem' }}
                >
                  Skip →
                </button>
                <button
                  onClick={giveUp}
                  disabled={isLoading}
                  className="btn"
                  style={{
                    background: '#efbdeb',
                    flex: 1,
                    padding: '10px 0',
                    fontSize: '0.875rem',
                  }}
                >
                  Give Up
                </button>
              </div>
            </div>
          )}

          {/* Reveal */}
          {isRevealed && reveal && (
            <RevealCard
              reveal={reveal}
              guessedCorrectly={results.at(-1) === 'correct'}
              attemptsUsed={results.length}
              onNext={startRound}
              onShare={share}
            />
          )}

          {/* Share feedback toast */}
          {shareStatus !== 'idle' && (
            <p
              style={{
                textAlign: 'center',
                fontWeight: 700,
                fontSize: '0.875rem',
                background: '#f9c784',
                border: '3px solid #000',
                padding: '8px 16px',
              }}
              role="status"
              aria-live="polite"
            >
              {shareStatus === 'shared' ? '✓ Shared!' : '✓ Copied to clipboard!'}
            </p>
          )}
        </>
      )}
    </div>
  )
}
