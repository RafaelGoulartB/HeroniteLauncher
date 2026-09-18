import type { CollectionGameMetadata } from 'common/types/local-library'

export function blankMetadata(
  appName: string,
  runner: string
): CollectionGameMetadata {
  return {
    appName,
    runner,
    developers: [],
    publishers: [],
    genres: [],
    themes: [],
    gameModes: [],
    platforms: [],
    features: [],
    websites: [],
    fieldSources: {}
  }
}

export function uniqueNames(
  values: Array<string | undefined> | undefined,
  max = 12
) {
  const seen = new Set<string>()
  const next: string[] = []
  for (const value of values ?? []) {
    const name = value?.trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    next.push(name)
    if (next.length >= max) break
  }
  return next
}

export function clipText(value: string | undefined, max = 2000) {
  const text = value?.replace(/\s+/g, ' ').trim() ?? ''
  if (!text) return undefined
  return text.length > max ? `${text.slice(0, max - 1).trim()}…` : text
}

export function stripHtml(value?: string) {
  if (!value) return ''
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim()
}
