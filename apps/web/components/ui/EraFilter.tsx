'use client'

import type { Era } from '@dhun/shared'

const ERAS: { value: Era; label: string }[] = [
  { value: '50s-70s', label: '50s–70s' },
  { value: '80s', label: '80s' },
  { value: '90s', label: '90s' },
  { value: '2000s', label: '2000s' },
  { value: '2010s', label: '2010s' },
  { value: '2020s', label: '2020s' },
]

interface EraFilterProps {
  selected: Era | null
  onChange: (era: Era | null) => void
}

export function EraFilter({ selected, onChange }: EraFilterProps) {
  return (
    <div
      style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}
      role="group"
      aria-label="Filter by era"
    >
      {[{ value: null, label: 'All eras' }, ...ERAS].map(({ value, label }) => (
        <button
          key={value ?? 'all'}
          onClick={() => onChange(value as Era | null)}
          className="btn"
          style={{
            padding: '6px 14px',
            fontSize: '0.8rem',
            background: selected === value ? '#000' : '#fff',
            color: selected === value ? '#fff' : '#000',
          }}
          aria-pressed={selected === value}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
