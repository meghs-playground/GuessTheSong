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
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => query.trim().length >= 2 && results.length > 0 && setOpen(true)}
        disabled={disabled}
        style={{
          width: '100%',
          background: '#fff',
          border: '3px solid #000',
          boxShadow: '4px 4px 0 #000',
          padding: '12px 16px',
          fontSize: '1rem',
          fontWeight: 500,
          fontFamily: 'inherit',
          outline: 'none',
        }}
        placeholder={placeholder}
        aria-label="Search for a song"
        aria-autocomplete="list"
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open && activeIdx >= 0 ? `suggestion-${activeIdx}` : undefined}
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
          style={{
            position: 'absolute',
            zIndex: 50,
            top: '100%',
            left: 0,
            right: 0,
            background: '#fff',
            border: '3px solid #000',
            borderTop: 'none',
            maxHeight: 240,
            overflowY: 'auto',
            listStyle: 'none',
            margin: 0,
            padding: 0,
          }}
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
              style={{
                padding: '12px 16px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 500,
                borderBottom: idx < results.length - 1 ? '1px solid #000' : 'none',
                background: idx === activeIdx ? '#6bbaec' : '#fff',
              }}
            >
              {result.display}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
