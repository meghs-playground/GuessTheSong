'use client'

import type { Era } from '@dhun/shared'

const ERAS: { value: Era; label: string }[] = [
  { value: '50s-70s', label: "50s–70s" },
  { value: '80s', label: "80s" },
  { value: '90s', label: "90s" },
  { value: '2000s', label: "2000s" },
  { value: '2010s', label: "2010s" },
  { value: '2020s', label: "2020s" },
]

interface EraFilterProps {
  selected: Era | null
  onChange: (era: Era | null) => void
}

export function EraFilter({ selected, onChange }: EraFilterProps) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by era">
      <button
        onClick={() => onChange(null)}
        className={`brutal-btn px-3 py-1 text-sm font-bold ${
          selected === null
            ? 'bg-[var(--color-ink)] text-white'
            : 'bg-[var(--color-paper)] text-ink'
        }`}
        aria-pressed={selected === null}
      >
        All
      </button>
      {ERAS.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => onChange(selected === value ? null : value)}
          className={`brutal-btn px-3 py-1 text-sm font-bold ${
            selected === value
              ? 'bg-[var(--color-ink)] text-white'
              : 'bg-[var(--color-paper)] text-ink'
          }`}
          aria-pressed={selected === value}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
