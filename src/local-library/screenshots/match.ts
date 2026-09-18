const STOPWORDS = new Set(['a', 'an', 'and', 'of', 'the', 'to', 'for'])

const EDITION_RE =
  /\b((director['’`]?s|game of the year|goty|definitive|ultimate|complete|deluxe|gold|standard|enhanced|anniversary|special|limited|windows)\s*(edition|cut)?|director s cut|remastered|remaster|goty|edition)\b/gi

const ARTICLE_RE = /^(the|a|an)\s+/

export function normalizeScreenshotName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[Δδ]/g, ' delta ')
    .replace(/&/g, ' and ')
    .replace(/[’`´]/g, "'")
    .replace(/[™®©]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function compact(value: string) {
  return value.replace(/\s+/g, '')
}

export function coreScreenshotName(value: string): string {
  return normalizeScreenshotName(value.replace(EDITION_RE, ' '))
    .replace(EDITION_RE, ' ')
    .replace(/\s+/g, ' ')
    .replace(ARTICLE_RE, '')
    .trim()
}

function tokens(value: string): string[] {
  return value.split(' ').filter(Boolean)
}

function significantTokens(value: string): string[] {
  return tokens(value).filter((item) => !STOPWORDS.has(item))
}

function numbers(items: string[]): string[] {
  return items.filter((item) => /^\d+$/.test(item))
}

function sameSet(left: string[], right: string[]) {
  if (left.length !== right.length) return false
  const wanted = new Set(left)
  return right.every((item) => wanted.has(item))
}

function isPrefix(query: string[], folder: string[]) {
  if (!query.length || query.length > folder.length) return false
  return query.every((item, index) => folder[index] === item)
}

export function scoreScreenshotFolder(query: string, folder: string): number {
  const qn = normalizeScreenshotName(query)
  const fn = normalizeScreenshotName(folder)
  if (!qn || !fn) return 0
  if (qn === fn) return 100
  if (compact(qn) === compact(fn)) return 97

  const qc = coreScreenshotName(query)
  const fc = coreScreenshotName(folder)
  if (qc && fc && qc === fc) return 94
  if (qc && fc && compact(qc) === compact(fc)) return 91

  const qTokens = significantTokens(qc || qn)
  const fTokens = significantTokens(fc || fn)
  if (!qTokens.length || !fTokens.length) return 0

  const qNums = numbers(qTokens)
  const fNums = numbers(fTokens)
  if (qNums.length && !sameSet(qNums, fNums)) return 0

  const setQ = new Set(qTokens)
  const setF = new Set(fTokens)
  let inter = 0
  for (const token of setQ) {
    if (setF.has(token)) inter += 1
  }
  if (!inter) return 0

  const union = new Set([...setQ, ...setF]).size
  const jaccard = inter / union
  const coverage = inter / setQ.size
  const extra = [...setF].filter((token) => !setQ.has(token))
  let penalty = 0
  if (!qNums.length && fNums.length) penalty += 30
  if (extra.length >= 2) penalty += 22
  else if (extra.length === 1) penalty += 10
  if (extra.length && !isPrefix(qTokens, fTokens) && !qNums.length) {
    penalty += 18
  }

  let score = Math.round(jaccard * 50 + coverage * 45)
  if (coverage === 1 && qNums.length && sameSet(qNums, fNums)) {
    score = Math.max(score, 80)
  }
  if (isPrefix(qTokens, fTokens) && coverage === 1) {
    score = Math.max(score, 74)
  }
  const qCompact = compact(qc || qn)
  const fCompact = compact(fc || fn)
  if (
    qCompact &&
    fCompact &&
    (fCompact.startsWith(qCompact) || qCompact.startsWith(fCompact))
  ) {
    const ratio =
      Math.min(qCompact.length, fCompact.length) /
      Math.max(qCompact.length, fCompact.length)
    score = Math.max(score, Math.round(70 * ratio + 20))
  }

  return Math.max(0, score - penalty)
}

export function pickScreenshotFolder(
  queries: string[],
  folders: string[],
  steamAppId?: string,
  minScore = 64
): { folder: string; score: number } | undefined {
  let best: { folder: string; score: number } | undefined
  for (const folder of folders) {
    if (
      steamAppId &&
      (folder === steamAppId || folder.startsWith(`${steamAppId} `))
    ) {
      return { folder, score: 100 }
    }
    let score = 0
    for (const query of queries) {
      let next = scoreScreenshotFolder(query, folder)
      const qTokens = significantTokens(coreScreenshotName(query))
      const fTokens = significantTokens(coreScreenshotName(folder))
      const qNums = numbers(qTokens)
      const fNums = numbers(fTokens)
      const qWords = qTokens.filter((item) => !/^\d+$/.test(item))
      const wordHits = qWords.filter((item) => fTokens.includes(item)).length
      if (
        qNums.length &&
        sameSet(qNums, fNums) &&
        qWords.length &&
        wordHits / qWords.length >= 0.5
      ) {
        next = Math.max(next, 82)
      }
      score = Math.max(score, next)
    }
    if (score < minScore) continue
    if (!best || score > best.score) best = { folder, score }
  }
  return best
}
