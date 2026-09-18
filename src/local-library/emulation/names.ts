const PROPS_RE = /\[(.*?)\]|\((.*?)\)/g

export function sanitizeRomName(name: string): string {
  return name
    .replace(PROPS_RE, '')
    .replace(/[’`]/g, "'")
    .replace(/[™®©]/g, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function romProperties(originalName: string): string[] {
  const properties: string[] = []
  const matches = originalName.matchAll(PROPS_RE)
  for (const match of matches) {
    const value = match[1] || match[2]
    if (!value) continue
    for (const part of value.split(',')) {
      const trimmed = part.trim()
      if (trimmed) properties.push(trimmed)
    }
  }
  return properties
}

export function romDiscLabel(originalName: string): string | undefined {
  return romProperties(originalName).find((item) =>
    /^(disc|disk|side)\b/i.test(item)
  )
}

export function titleFromRomPath(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '')
  return sanitizeRomName(base) || base
}
