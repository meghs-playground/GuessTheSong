interface GuessChipProps {
  title: string
  type: 'wrong' | 'skipped'
}

export function GuessChip({ title, type }: GuessChipProps) {
  const isWrong = type === 'wrong'
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 14px',
        background: '#efbdeb',
        border: '3px solid #000',
        boxShadow: '2px 2px 0 #000',
        fontSize: '0.875rem',
        fontWeight: 600,
      }}
      role="status"
      aria-label={`${isWrong ? 'Wrong guess' : 'Skipped'}: ${title}`}
    >
      <span aria-hidden="true" style={{ fontWeight: 900, fontSize: '1rem' }}>
        {isWrong ? '✕' : '–'}
      </span>
      <span>{isWrong ? title : 'Skipped'}</span>
    </div>
  )
}
