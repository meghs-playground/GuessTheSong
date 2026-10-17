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
  const [activeIdx, setActiveIdx] = useState(0)
  const listboxId = useId()
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length >= 2) {
      onSearch(trimmed)
      setOpen(true)
      setActiveIdx(0)
    } else {
      setOpen(false)
      setActiveIdx(-1)
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
    if (!open) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (results.length > 0) {
        setActiveIdx((i) => Math.min(i + 1, results.length - 1))
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (results.length > 0) {
        setActiveIdx((i) => Math.max(i - 1, 0))
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (results.length > 0) {
        const targetIdx = activeIdx >= 0 && activeIdx < results.length ? activeIdx : 0
        const selected = results[targetIdx]
        if (selected) handleSelect(selected)
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  function handleSelect(result: SearchResult) {
    setQuery('')
    setOpen(false)
    setActiveIdx(-1)
    onSelect(result)
  }

  const trimmedQuery = query.trim()
  const showDropdown = open && trimmedQuery.length >= 2

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => trimmedQuery.length >= 2 && setOpen(true)}
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
        aria-controls={showDropdown ? listboxId : undefined}
        aria-activedescendant={
          showDropdown && results.length > 0 && activeIdx >= 0
            ? `suggestion-${activeIdx}`
            : undefined
        }
        role="combobox"
        aria-expanded={showDropdown}
        autoComplete="off"
        spellCheck={false}
      />
      {showDropdown && (
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
            maxHeight: 260,
            overflowY: 'auto',
            listStyle: 'none',
            margin: 0,
            padding: 0,
            boxShadow: '4px 4px 0 rgba(0,0,0,0.2)',
          }}
        >
          {results.length > 0 ? (
            results.map((result, idx) => (
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
                  borderBottom: idx < results.length - 1 ? '1px solid #eee' : 'none',
                  background: idx === activeIdx ? '#6bbaec' : '#fff',
                  color: '#000',
                  transition: 'background 0.1s ease',
                }}
              >
                {result.display}
              </li>
            ))
          ) : (
            <li
              style={{
                padding: '14px 16px',
                fontSize: '0.875rem',
                color: '#666',
                fontStyle: 'italic',
                background: '#fafafa',
              }}
            >
              No matching songs found
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
