interface GuessChipProps {
  title: string
  type: 'wrong' | 'skipped'
}

export function GuessChip({ title, type }: GuessChipProps) {
  const isWrong = type === 'wrong'
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 brutal-border brutal-shadow-sm bg-[var(--color-orchid)] text-sm font-medium"
      role="status"
      aria-label={`${isWrong ? 'Wrong guess' : 'Skipped'}: ${title}`}
    >
      <span aria-hidden="true">{isWrong ? '✕' : '–'}</span>
      <span>{isWrong ? title : 'Skipped'}</span>
    </div>
  )
}
