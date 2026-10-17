/**
 * Lightweight HMAC-SHA-256 round tokens using the Web Crypto API.
 *
 * Token structure (base64url):
 *   payload = JSON { songId, era, iat }
 *   token   = base64url(payload) + "." + base64url(hmac)
 *
 * The song ID is never sent to the client — only the opaque token is.
 */

interface TokenPayload {
  songId: string
  era: string | null
  iat: number // unix seconds
}

const SEPARATOR = '.'
const TOKEN_TTL_SECONDS = 60 * 10 // 10 minutes per round

function base64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function base64urlDecode(str: string): Uint8Array {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=')
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
}

async function importKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

export async function signToken(
  payload: Omit<TokenPayload, 'iat'>,
  secret: string,
): Promise<string> {
  const full: TokenPayload = { ...payload, iat: Math.floor(Date.now() / 1000) }
  const enc = new TextEncoder()
  const payloadB64 = base64url(enc.encode(JSON.stringify(full)).buffer as ArrayBuffer)
  const key = await importKey(secret)
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payloadB64))
  return `${payloadB64}${SEPARATOR}${base64url(sig)}`
}

export async function verifyToken(
  token: string,
  secret: string,
): Promise<TokenPayload | null> {
  const parts = token.split(SEPARATOR)
  if (parts.length !== 2) return null
  const [payloadB64, sigB64] = parts as [string, string]

  const key = await importKey(secret)
  const enc = new TextEncoder()
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    base64urlDecode(sigB64),
    enc.encode(payloadB64),
  )
  if (!valid) return null

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(payloadB64))) as TokenPayload
    // Check TTL
    if (Math.floor(Date.now() / 1000) - payload.iat > TOKEN_TTL_SECONDS) return null
    return payload
  } catch {
    return null
  }
}
