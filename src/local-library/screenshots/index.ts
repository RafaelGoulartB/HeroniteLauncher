import { existsSync, readdirSync, statSync } from 'graceful-fs'
import { basename, extname, join, relative, sep } from 'path'
import type { CollectionScreenshotsResult } from 'common/types/local-library'
import { localArtUrl, screenshotsRoot } from '../protocol'
import { pickScreenshotFolder } from './match'

const IMAGE_EXT = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.bmp',
  '.avif',
  '.jxl',
  '.jxr'
])

type FolderCache = {
  root: string
  mtime: number
  folders: string[]
}

let folderCache: FolderCache | null = null

function listGameFolders(root: string): string[] {
  let mtime = 0
  try {
    mtime = statSync(root).mtimeMs
  } catch {
    return []
  }
  if (folderCache && folderCache.root === root && folderCache.mtime === mtime) {
    return folderCache.folders
  }
  try {
    const folders = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name)
    folderCache = { root, mtime, folders }
    return folders
  } catch {
    folderCache = null
    return []
  }
}

function isImageFile(name: string) {
  return IMAGE_EXT.has(extname(name).toLowerCase())
}

function listImages(
  folderPath: string,
  depth = 0
): { name: string; takenAt: number }[] {
  let entries: { name: string; dir: boolean }[] = []
  try {
    entries = readdirSync(folderPath, { withFileTypes: true }).map((entry) => ({
      name: entry.name,
      dir: entry.isDirectory()
    }))
  } catch {
    return []
  }

  const files = entries
    .filter(
      (entry) =>
        !entry.dir && isImageFile(entry.name) && !entry.name.startsWith('.')
    )
    .map((entry) => {
      try {
        return {
          name: entry.name,
          takenAt: statSync(join(folderPath, entry.name)).mtimeMs
        }
      } catch {
        return { name: entry.name, takenAt: 0 }
      }
    })

  if (files.length || depth >= 1) {
    return files.sort((a, b) => a.takenAt - b.takenAt)
  }

  const nested: { name: string; takenAt: number }[] = []
  for (const entry of entries) {
    if (!entry.dir || entry.name.startsWith('.')) continue
    for (const file of listImages(join(folderPath, entry.name), depth + 1)) {
      nested.push({
        name: join(entry.name, file.name),
        takenAt: file.takenAt
      })
    }
  }
  return nested.sort((a, b) => a.takenAt - b.takenAt)
}

function uniqueQueries(title: string, aliases?: string[]) {
  return [
    ...new Set(
      [title, ...(aliases ?? [])]
        .map((item) => item.trim())
        .filter((item) => item.length >= 2)
    )
  ]
}

export function getCollectionScreenshots(args: {
  title: string
  steamAppId?: string
  aliases?: string[]
}): CollectionScreenshotsResult {
  const root = screenshotsRoot()
  if (!root || !existsSync(root)) {
    return { folder: root ?? undefined, items: [] }
  }

  const queries = uniqueQueries(args.title, args.aliases)
  const folders = listGameFolders(root)
  const match = pickScreenshotFolder(queries, folders, args.steamAppId)
  if (!match) return { folder: root, items: [] }

  const matchedPath = join(root, match.folder)
  const items = listImages(matchedPath).map((file) => {
    const rel = relative(root, join(matchedPath, file.name))
    const segments = rel.split(sep).filter(Boolean)
    return {
      id: rel,
      name: basename(file.name),
      url: localArtUrl('screenshots', ...segments),
      takenAt: file.takenAt || undefined
    }
  })

  return {
    folder: root,
    matchedFolder: match.folder,
    items
  }
}
