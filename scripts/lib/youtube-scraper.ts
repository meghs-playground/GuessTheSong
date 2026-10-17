/**
 * youtube-scraper.ts
 *
 * Scrapes song titles and metadata from YouTube / YouTube Music playlists.
 * Supports modern YouTube `lockupViewModel` and full InnerTube continuation pagination.
 */

export interface PlaylistItem {
  rawTitle: string
  cleanTitle: string
  movieOrAlbum?: string | undefined
  artistOrChannel?: string | undefined
  videoId?: string | undefined
}

// Blocklist: non-songs, ambient tracks, promotional content, remixes/edits
const BLOCK_PATTERNS = [
  /\bremix\b/i,
  /\bphonk\b/i,
  /\bedit\b/i,
  /\blo.?fi\b/i,
  /\bslowed\b/i,
  /\breverb\b/i,
  /\bcover\b/i,
  /\bkaraoke\b/i,
  /\binstrumental\b/i,
  /\breprise\b/i,
  /\btribute\b/i,
  /\bunplugged\b/i,
  /\bacoustic\b/i,
  /\bmashup\b/i,
  /\bmedley\b/i,
  /\bnightcore\b/i,
  /\bdrill\b/i,
  /\btrap mix\b/i,
  /\bchillout\b/i,
  /\bteaser\b/i,
  /\btrailer\b/i,
  /\bdialogue promo\b/i,
  /\bbehind the scenes\b/i,
  /\bjukebox\b/i,
  /\bfull album\b/i,
  /\bfull movie\b/i,
  /\b10 hour\b/i,
  /\b1 hour\b/i,
  /\bbass boosted\b/i,
]

export function isCleanSongTitle(title: string): boolean {
  if (!title || title.trim().length < 2) return false
  return !BLOCK_PATTERNS.some((pattern) => pattern.test(title))
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Cleans YouTube video titles into candidate song titles and film names.
 */
export function cleanYoutubeTitle(raw: string): { songTitle: string; film?: string | undefined } {
  let title = raw.trim()

  // 1. Extract film from (From "Film Name") or (From “Film Name”)
  let extractedFilm: string | undefined
  const filmMatch = title.match(/\b(?:from|from the movie|from the film)\s*["“'‘]([^"”'’]+)["”'’]/i)
  if (filmMatch && filmMatch[1]) {
    extractedFilm = filmMatch[1].trim()
  }

  // Remove parenthetical/bracketed 'From ...' phrases
  title = title.replace(/\s*[\(\[]\s*(?:from|from the film|from the movie)[^\)\]]+[\)\]]/gi, ' ')

  // 2. Remove standard parenthetical noise
  const bracketNoise = [
    /\s*[\(\[]\s*(?:official\s+)?(?:music\s+)?video\s*[\)\]]/gi,
    /\s*[\(\[]\s*(?:official\s+)?lyrical\s*(?:video|song)?\s*[\)\]]/gi,
    /\s*[\(\[]\s*full\s*(?:video|audio)?\s*song\s*[\)\]]/gi,
    /\s*[\(\[]\s*(?:audio|video)\s*(?:song)?\s*[\)\]]/gi,
    /\s*[\(\[]\s*(?:lyrics|geet|ghazal\s+version)\s*[\)\]]/gi,
    /\s*[\(\[]\s*4k\s*(?:uhd|60fps)?\s*[\)\]]/gi,
    /\s*[\(\[]\s*hd\s*[\)\]]/gi,
    /\s*[\(\[]\s*version\s*[\)\]]/gi,
  ]
  for (const regex of bracketNoise) {
    title = title.replace(regex, ' ')
  }

  // 3. Remove handles and hashtags
  title = title.replace(/@[a-zA-Z0-9_.-]+/g, ' ').replace(/#[a-zA-Z0-9_.-]+/g, ' ')

  // 4. Split by primary separator '|'
  if (title.includes('|')) {
    const segments = title.split('|').map((s) => s.trim()).filter(Boolean)
    if (segments.length >= 2) {
      title = segments[0]!
      if (!extractedFilm && segments[1]) {
        const seg1 = segments[1].replace(/^(?:movie|film)\s*:\s*/i, '').trim()
        if (
          seg1.length < 40 &&
          !seg1.toLowerCase().includes('singer') &&
          !seg1.toLowerCase().includes('kapoor') &&
          !seg1.toLowerCase().includes('khan')
        ) {
          extractedFilm = seg1
        }
      }
    }
  }

  // 5. Handle " - Full Video", " - Lyrical Video", " - Agneepath"
  title = title.replace(/\s*-\s*(?:full\s+)?(?:video|audio|lyrical|song)\b.*/gi, '')

  if (title.includes(' - ')) {
    const parts = title.split(' - ').map((s) => s.trim()).filter(Boolean)
    if (parts.length >= 2) {
      title = parts[0]!
      if (!extractedFilm && parts[1] && parts[1].length < 40) {
        extractedFilm = parts[1].trim()
      }
    }
  }

  // 6. Remove remaining inline video/song markers
  title = title
    .replace(/\b(?:official\s+)?(?:music\s+)?video\b/gi, '')
    .replace(/\b(?:official\s+)?lyrical\s+(?:video|song)?\b/gi, '')
    .replace(/\bfull\s+(?:video\s+)?song\b/gi, '')
    .replace(/\bfull\s+audio\s+song\b/gi, '')

  // 7. Strip stray brackets and extra whitespace
  title = title
    .replace(/[()[\]{}"“”'‘’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return {
    songTitle: title,
    film: extractedFilm,
  }
}

function extractContinuationToken(item: any): string | null {
  if (!item) return null
  return (
    item.continuationItemViewModel?.continuationCommand?.innertubeCommand?.continuationCommand?.token ||
    item.continuationItemViewModel?.continuationCommand?.token ||
    item.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token ||
    null
  )
}

function parseVideoItem(item: any, seenTitles: Set<string>): PlaylistItem | null {
  // Modern YouTube UI (lockupViewModel)
  if (item.lockupViewModel) {
    const lvm = item.lockupViewModel
    const rawTitle = lvm.metadata?.lockupMetadataViewModel?.title?.content ?? ''
    const subtitle =
      lvm.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows?.[0]
        ?.metadataParts?.[0]?.text?.content ?? ''
    const videoId = lvm.contentId

    if (rawTitle && isCleanSongTitle(rawTitle)) {
      const { songTitle, film } = cleanYoutubeTitle(rawTitle)
      const norm = songTitle.toLowerCase().replace(/[^a-z0-9]/g, '')
      if (norm.length > 1 && !seenTitles.has(norm)) {
        seenTitles.add(norm)
        return {
          rawTitle,
          cleanTitle: songTitle,
          movieOrAlbum: film,
          artistOrChannel: subtitle.replace(/\s*-\s*Topic$/i, '').trim(),
          videoId,
        }
      }
    }
  }

  // Legacy UI (playlistVideoRenderer)
  if (item.playlistVideoRenderer) {
    const pvr = item.playlistVideoRenderer
    const rawTitle = pvr.title?.runs?.[0]?.text ?? pvr.title?.simpleText ?? ''
    const byline = pvr.shortBylineText?.runs?.[0]?.text ?? ''
    const videoId = pvr.videoId

    if (rawTitle && isCleanSongTitle(rawTitle)) {
      const { songTitle, film } = cleanYoutubeTitle(rawTitle)
      const norm = songTitle.toLowerCase().replace(/[^a-z0-9]/g, '')
      if (norm.length > 1 && !seenTitles.has(norm)) {
        seenTitles.add(norm)
        return {
          rawTitle,
          cleanTitle: songTitle,
          movieOrAlbum: film,
          artistOrChannel: byline.replace(/\s*-\s*Topic$/i, '').trim(),
          videoId,
        }
      }
    }
  }

  return null
}

/** Fetch a YouTube/YouTube Music playlist and extract all songs including all paginated continuation batches */
export async function scrapePlaylist(playlistUrl: string): Promise<PlaylistItem[]> {
  // Normalize URL to standard youtube.com/playlist
  let url = playlistUrl
  if (url.includes('music.youtube.com')) {
    url = url.replace('music.youtube.com', 'www.youtube.com')
  }

  console.log(`\n→ Fetching playlist: ${url}`)

  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  })

  if (!res.ok) {
    console.warn(`  Failed to fetch ${url} (HTTP ${res.status})`)
    return []
  }

  const html = await res.text()

  const match =
    html.match(/var ytInitialData\s*=\s*({.+?});<\/script>/s) ||
    html.match(/ytInitialData\s*=\s*({.+?});/s)

  if (!match || !match[1]) {
    console.warn(`  Could not find ytInitialData in HTML for ${url}`)
    return []
  }

  let data: any
  try {
    data = JSON.parse(match[1])
  } catch (err) {
    console.warn(`  Failed to parse ytInitialData JSON for ${url}:`, err)
    return []
  }

  const playlistTitle = data.metadata?.playlistMetadataRenderer?.title ?? 'Untitled Playlist'
  console.log(`  Playlist Title: "${playlistTitle}"`)

  const apiKey =
    html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1] ||
    'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8'
  const clientVersion =
    html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1] ||
    '2.20261016.01.00'

  const items: PlaylistItem[] = []
  const seenTitles = new Set<string>()
  let continuationToken: string | null = null

  // 1. Traverse tabs & sections in initial page
  const tabs = data.contents?.twoColumnBrowseResultsRenderer?.tabs ?? []
  for (const tab of tabs) {
    const sectionList = tab.tabRenderer?.content?.sectionListRenderer?.contents ?? []
    for (const section of sectionList) {
      const itemSection = section.itemSectionRenderer?.contents ?? []
      for (const item of itemSection) {
        const parsed = parseVideoItem(item, seenTitles)
        if (parsed) items.push(parsed)

        const token = extractContinuationToken(item)
        if (token) {
          continuationToken = token
          break
        }
      }

      if (section.playlistVideoListRenderer?.contents) {
        for (const item of section.playlistVideoListRenderer.contents) {
          const parsed = parseVideoItem(item, seenTitles)
          if (parsed) items.push(parsed)

          const token = extractContinuationToken(item)
          if (token) {
            continuationToken = token
            break
          }
        }
      }
    }
  }

  console.log(`  Initial page: ${items.length} songs extracted`)

  // 2. Fetch continuations if present (handles playlists with hundreds/thousands of songs)
  let page = 1
  while (continuationToken && page < 40) {
    page++
    try {
      const browseUrl = `https://www.youtube.com/youtubei/v1/browse?key=${apiKey}&prettyPrint=false`
      const payload = {
        context: {
          client: {
            clientName: 'WEB',
            clientVersion,
            hl: 'en',
            gl: 'IN',
          },
        },
        continuation: continuationToken,
      }

      const contRes = await fetch(browseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        },
        body: JSON.stringify(payload),
      })

      if (!contRes.ok) {
        console.warn(`  Continuation page ${page} returned HTTP ${contRes.status}, stopping pagination.`)
        break
      }

      const contJson = (await contRes.json()) as any
      const action =
        contJson.onResponseReceivedActions?.[0]?.appendContinuationItemsAction ||
        contJson.continuationContents?.playlistVideoListContinuation

      const contItems = action?.continuationItems || action?.contents || []

      continuationToken = null
      let newCount = 0

      for (const it of contItems) {
        const parsed = parseVideoItem(it, seenTitles)
        if (parsed) {
          items.push(parsed)
          newCount++
        }

        const t = extractContinuationToken(it)
        if (t) continuationToken = t
      }

      console.log(`  Page ${page}: +${newCount} songs (Total extracted: ${items.length})`)

      // Polite delay between continuation requests
      await sleep(250)
    } catch (err) {
      console.warn(`  Error fetching continuation page ${page}:`, err)
      break
    }
  }

  console.log(`✓ Total clean songs extracted from "${playlistTitle}": ${items.length}`)
  return items
}
