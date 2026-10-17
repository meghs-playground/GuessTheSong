import type {
  Era,
  RoundStartResponse,
  GuessRequest,
  GuessResponse,
} from '@dhun/shared'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787'

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`API ${path} → ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

export const apiClient = {
  /** Start a new round, optionally filtered by era */
  startRound(era?: Era): Promise<RoundStartResponse> {
    const params = era ? `?era=${encodeURIComponent(era)}` : ''
    return apiFetch<RoundStartResponse>(`/round${params}`)
  },

  /** Submit a guess. Server validates without revealing the answer early. */
  guess(payload: GuessRequest): Promise<GuessResponse> {
    return apiFetch<GuessResponse>('/guess', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  /** Resolve the audio preview URL for a round token (goes through proxy if needed) */
  resolveAudio(roundToken: string): Promise<{ url: string }> {
    return apiFetch<{ url: string }>(`/audio/${encodeURIComponent(roundToken)}`)
  },
}
