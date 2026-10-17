import type { SongReveal } from '@dhun/shared'

interface RevealCardProps {
  reveal: SongReveal
  guessedCorrectly: boolean
  attemptsUsed: number
  onNext: () => void
  onShare: () => void
}

export function RevealCard({
  reveal,
  guessedCorrectly,
  attemptsUsed,
  onNext,
  onShare,
}: RevealCardProps) {
  const bg = guessedCorrectly ? '#5f7367' : '#efbdeb'
  const textColor = guessedCorrectly ? '#fff' : '#000'

  return (
    <div
      style={{
        width: '100%',
        background: bg,
        border: '3px solid #000',
        boxShadow: '4px 4px 0 #000',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
      role="region"
      aria-label="Round result"
    >
      {/* Result label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: textColor }}>
        <span style={{ fontSize: '1.5rem', fontWeight: 900 }} aria-hidden="true">
          {guessedCorrectly ? '✓' : '✕'}
        </span>
        <span style={{ fontSize: '1.1rem', fontWeight: 800 }}>
          {guessedCorrectly ? `Guessed in ${attemptsUsed}!` : 'Not this time!'}
        </span>
      </div>

      {/* Song info */}
      <div style={{ color: textColor, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, lineHeight: 1.2 }}>
          {reveal.canonicalTitle}
        </p>
        <p style={{ margin: 0, fontSize: '1rem', fontWeight: 600, opacity: 0.85 }}>
          {reveal.film} &middot; {reveal.year}
        </p>
        <p style={{ margin: 0, fontSize: '0.875rem', opacity: 0.75 }}>
          {reveal.artists.join(', ')}
        </p>
        <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.65 }}>Music: {reveal.composer}</p>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <a
          href={reveal.streamingLink}
          target="_blank"
          rel="noopener noreferrer"
          className="btn"
          style={{
            background: '#fff',
            color: '#000',
            padding: '10px 16px',
            fontSize: '0.875rem',
            textDecoration: 'none',
          }}
          aria-label={`Listen to ${reveal.canonicalTitle} on Apple Music`}
        >
          ♫ Listen
        </a>
        <button
          onClick={onShare}
          className="btn"
          style={{
            background: '#f9c784',
            color: '#000',
            padding: '10px 16px',
            fontSize: '0.875rem',
          }}
        >
          Share
        </button>
        <button
          onClick={onNext}
          className="btn"
          style={{
            background: '#6bbaec',
            color: '#000',
            padding: '10px 16px',
            fontSize: '0.875rem',
          }}
        >
          Next Song →
        </button>
      </div>
    </div>
  )
}
