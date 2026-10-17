import type { SongReveal } from '@dhun/shared'

interface RevealCardProps {
  reveal: SongReveal
  guessedCorrectly: boolean
  attemptsUsed: number
  onNext: () => void
  onShare: () => void
}

export function RevealCard({ reveal, guessedCorrectly, attemptsUsed, onNext, onShare }: RevealCardProps) {
  return (
    <div
      className={`w-full brutal-border brutal-shadow p-5 flex flex-col gap-4 ${
        guessedCorrectly ? 'bg-[var(--color-teal)] text-white' : 'bg-[var(--color-orchid)] text-black'
      }`}
      role="region"
      aria-label="Round result"
    >
      {/* Result label */}
      <div className="flex items-center gap-2 font-bold text-lg">
        <span aria-hidden="true">{guessedCorrectly ? '✓' : '✕'}</span>
        <span>{guessedCorrectly ? `Guessed it! (attempt ${attemptsUsed})` : 'Better luck next time!'}</span>
      </div>

      {/* Song info */}
      <div className="flex flex-col gap-1">
        <p className="text-2xl font-bold leading-tight">{reveal.canonicalTitle}</p>
        <p className="text-base font-medium opacity-90">{reveal.film} · {reveal.year}</p>
        <p className="text-sm opacity-80">{reveal.artists.join(', ')}</p>
        <p className="text-sm opacity-70">Music: {reveal.composer}</p>
      </div>

      {/* Actions */}
      <div className="flex gap-3 flex-wrap">
        <a
          href={reveal.streamingLink}
          target="_blank"
          rel="noopener noreferrer"
          className="brutal-btn bg-[var(--color-paper)] text-ink px-4 py-2 font-bold text-sm inline-flex items-center gap-2"
          aria-label={`Listen to ${reveal.canonicalTitle} on Apple Music`}
        >
          <span aria-hidden="true">♫</span> Listen
        </a>
        <button
          onClick={onShare}
          className="brutal-btn bg-[var(--color-apricot)] text-ink px-4 py-2 font-bold text-sm"
          aria-label="Share your result"
        >
          Share
        </button>
        <button
          onClick={onNext}
          className="brutal-btn bg-[var(--color-maya-blue)] text-ink px-4 py-2 font-bold text-sm"
          aria-label="Play next song"
        >
          Next Song →
        </button>
      </div>
    </div>
  )
}
