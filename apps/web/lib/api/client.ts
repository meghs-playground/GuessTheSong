import type { Era, RoundStartResponse, GuessRequest, GuessResponse } from '@dhun/shared'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787'

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`API ${path} → ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

export const apiClient = {
  /** Start a new round, optionally filtered by era, excluding recently seen songs */
  startRound(era?: Era, excludeIds?: string[]): Promise<RoundStartResponse> {
    const params = new URLSearchParams()
    if (era) params.set('era', era)
    // Send up to 50 most-recent IDs to exclude (URL length stays reasonable)
    if (excludeIds?.length) {
      params.set('exclude', excludeIds.slice(-50).join(','))
    }
    const qs = params.toString()
    return apiFetch<RoundStartResponse>(`/round${qs ? `?${qs}` : ''}`)
  },

  guess(payload: GuessRequest): Promise<GuessResponse> {
    return apiFetch<GuessResponse>('/guess', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  resolveAudio(roundToken: string): Promise<{ url: string; songId: string }> {
    return apiFetch<{ url: string; songId: string }>(`/audio/${encodeURIComponent(roundToken)}`)
  },
}
