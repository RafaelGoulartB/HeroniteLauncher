import { normalizeTitle } from '../playnite/mapper'

export function titleQueries(title: string): string[] {
  const cleaned = title.replaceAll('_', ' ').replace(/\s+/g, ' ').trim()
  const noEdition = cleaned.replace(
    /\s*[-–:]\s*(definitive|ultimate|complete|goty|deluxe|gold|standard|windows|linux).*$/i,
    ''
  )
  const colon = cleaned.replace(/\s+-\s+/g, ': ')
  return [...new Set([cleaned, noEdition, colon])].filter(
    (query) => query.length >= 2
  )
}

export function scoreTitle(query: string, name: string): number {
  const wanted = normalizeTitle(query)
  const got = normalizeTitle(name)
  if (!wanted || !got) return 0
  if (wanted === got) return 100
  if (got.startsWith(wanted) || wanted.startsWith(got)) {
    return Math.max(60, 90 - Math.abs(got.length - wanted.length))
  }
  if (got.includes(wanted) || wanted.includes(got)) return 50
  const wantedParts = wanted.split(' ').filter(Boolean)
  const hits = wantedParts.filter((part) => got.includes(part)).length
  if (wantedParts.length && hits / wantedParts.length >= 0.7) return 40
  return 0
}

export function pickBestMatch<T>(
  title: string,
  items: T[],
  nameOf: (item: T) => string,
  minScore = 45
): T | undefined {
  let best: { item: T; score: number } | undefined
  for (const item of items) {
    const score = scoreTitle(title, nameOf(item))
    if (score < minScore) continue
    if (!best || score > best.score) best = { item, score }
  }
  return best?.item
}
