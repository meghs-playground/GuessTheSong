'use client'

import { useState, useRef, useEffect, useId } from 'react'
import type { SearchResult } from '@dhun/shared'

interface SearchBoxProps {
  results: SearchResult[]
  onSearch: (query: string) => void
  onSelect: (result: SearchResult) => void
  disabled?: boolean
  placeholder?: string
}

export function SearchBox({
  results,
  onSearch,
  onSelect,
  disabled,
  placeholder = 'Search song, film or artist…',
}: SearchBoxProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const listboxId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length >= 2) {
      onSearch(trimmed)
      setOpen(true)
      setActiveIdx(-1)
    } else {
      setOpen(false)
    }
  }, [query, onSearch])

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault()
      const selected = results[activeIdx]
      if (selected) handleSelect(selected)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  function handleSelect(result: SearchResult) {
    setQuery(result.canonicalTitle)
    setOpen(false)
    onSelect(result)
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => query.trim().length >= 2 && results.length > 0 && setOpen(true)}
        disabled={disabled}
        className="w-full bg-[var(--color-paper)] brutal-border brutal-shadow px-4 py-3 text-base font-medium placeholder:text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
        placeholder={placeholder}
        aria-label="Search for a song"
        aria-autocomplete="list"
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={
          open && activeIdx >= 0 ? `suggestion-${activeIdx}` : undefined
        }
        role="combobox"
        aria-expanded={open}
        autoComplete="off"
        spellCheck={false}
      />
      {open && results.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Song suggestions"
          className="absolute z-50 top-full left-0 right-0 brutal-border border-t-0 bg-[var(--color-paper)] max-h-60 overflow-y-auto"
        >
          {results.map((result, idx) => (
            <li
              key={result.songId}
              id={`suggestion-${idx}`}
              role="option"
              aria-selected={idx === activeIdx}
              onMouseDown={(e) => {
                e.preventDefault()
                handleSelect(result)
              }}
              onMouseEnter={() => setActiveIdx(idx)}
              className={`
                px-4 py-3 cursor-pointer border-b border-black last:border-b-0
                text-sm font-medium
                ${idx === activeIdx ? 'bg-[var(--color-maya-blue)]' : 'hover:bg-[var(--color-frosted-blue)]'}
              `}
            >
              {result.display}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
