import {
  copyFileSync,
  existsSync,
  mkdirSync,
  unlinkSync,
  writeFileSync
} from 'graceful-fs'
import { basename, extname, join, relative, resolve, sep } from 'path'
import { fileURLToPath } from 'url'
import { app } from 'electron'
import axios, { isAxiosError } from 'axios'
import Store from 'electron-store'
import type { Runner } from 'common/types'
import type {
  CollectionArtKind,
  CollectionGameArt
} from 'common/types/local-library'
import { logWarning, LogPrefix } from 'backend/logger'
import { localArtFilePath, localArtUrl } from './protocol'

type ArtFile = {
  games: Record<string, CollectionGameArt>
}

const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'])
const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const DOWNLOAD_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0',
  Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.8',
  Referer: 'https://duckduckgo.com/'
}

const artFile = new Store<ArtFile>({
  cwd: 'local_library',
  name: 'art',
  defaults: { games: {} }
})

export function collectionArtKey(runner: string, appName: string) {
  return `${runner}:${appName}`
}

function artRoot() {
  return join(app.getPath('userData'), 'local_library', 'art')
}

function folderName(runner: string, appName: string) {
  return `${runner}_${appName}`.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120)
}

function fileFromUrl(url?: string) {
  if (!url) return undefined
  if (url.startsWith('localart:')) {
    return localArtFilePath(url) ?? undefined
  }
  if (url.startsWith('file:')) {
    try {
      return fileURLToPath(url)
    } catch {
      return undefined
    }
  }
  return undefined
}

function displayUrl(filePath: string) {
  const root = resolve(artRoot())
  const target = resolve(filePath)
  const rel = relative(root, target)
  if (!rel || rel.startsWith('..') || rel.startsWith(sep)) {
    return localArtUrl('art', basename(filePath))
  }
  return localArtUrl('art', ...rel.split(sep))
}

function isManaged(filePath: string) {
  const root = resolve(artRoot())
  const target = resolve(filePath)
  return target === root || target.startsWith(root + sep)
}

function removeManaged(url?: string) {
  const filePath = fileFromUrl(url)
  if (!filePath || !isManaged(filePath) || !existsSync(filePath)) return
  try {
    unlinkSync(filePath)
  } catch (error) {
    logWarning(
      `Could not remove Collection art ${filePath}: ${String(error)}`,
      LogPrefix.Backend
    )
  }
}

function hydrate(art?: CollectionGameArt): CollectionGameArt {
  if (!art) return {}
  const next: CollectionGameArt = {}
  if (art.coverUrl) {
    const path = fileFromUrl(art.coverUrl)
    if (path && existsSync(path)) next.coverUrl = displayUrl(path)
  }
  if (art.heroUrl) {
    const path = fileFromUrl(art.heroUrl)
    if (path && existsSync(path)) next.heroUrl = displayUrl(path)
  }
  return next
}

export function getAllCollectionArt(): Record<string, CollectionGameArt> {
  const games = artFile.get('games')
  const next: Record<string, CollectionGameArt> = {}
  for (const [key, art] of Object.entries(games)) {
    next[key] = hydrate(art)
  }
  return next
}

export function getCollectionGameArt(
  runner: string,
  appName: string
): CollectionGameArt {
  return hydrate(artFile.get('games')[collectionArtKey(runner, appName)])
}

function writeArt(
  runner: string,
  appName: string,
  art: CollectionGameArt
): CollectionGameArt {
  const key = collectionArtKey(runner, appName)
  const games = { ...artFile.get('games') }
  const cleaned = hydrate(art)
  if (!cleaned.coverUrl && !cleaned.heroUrl) delete games[key]
  else games[key] = cleaned
  artFile.set('games', games)
  return cleaned
}

function normalizeExt(ext: string) {
  const value = ext.replace('.', '').toLowerCase()
  return value === 'jpeg' ? 'jpg' : value
}

function sniffImageExt(bytes: Buffer): string | undefined {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpg'
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'png'
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46
  ) {
    return 'gif'
  }
  if (
    bytes.length >= 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp'
  }
  if (bytes.length >= 12 && bytes.toString('ascii', 4, 8) === 'ftyp') {
    return 'avif'
  }
  return undefined
}

function extFromUrl(url: string, contentType?: string) {
  const type = (contentType ?? '').split(';')[0].trim().toLowerCase()
  const fromType: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/pjpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif'
  }
  if (fromType[type]) return fromType[type]
  try {
    return normalizeExt(extname(new URL(url).pathname))
  } catch {
    return ''
  }
}

function destFile(
  runner: string,
  appName: string,
  kind: CollectionArtKind,
  ext: string
) {
  const dir = join(artRoot(), folderName(runner, appName))
  mkdirSync(dir, { recursive: true })
  return join(dir, `${kind}-${Date.now()}.${ext}`)
}

function applyArtFile(
  runner: Runner,
  appName: string,
  kind: CollectionArtKind,
  dest: string
): CollectionGameArt {
  const current = getCollectionGameArt(runner, appName)
  if (kind === 'cover') {
    removeManaged(current.coverUrl)
    current.coverUrl = displayUrl(dest)
  } else {
    removeManaged(current.heroUrl)
    current.heroUrl = displayUrl(dest)
  }
  return writeArt(runner, appName, current)
}

export function setCollectionGameArt(args: {
  appName: string
  runner: Runner
  kind: CollectionArtKind
  sourcePath: string
}): CollectionGameArt {
  const { appName, runner, kind, sourcePath } = args
  const ext = normalizeExt(extname(sourcePath))
  if (!ALLOWED_EXT.has(ext)) {
    throw new Error(`Unsupported image type: ${ext || 'unknown'}`)
  }
  if (!existsSync(sourcePath)) {
    throw new Error(`Image not found: ${sourcePath}`)
  }

  const dest = destFile(runner, appName, kind, ext)
  copyFileSync(sourcePath, dest)
  return applyArtFile(runner, appName, kind, dest)
}

async function downloadImageBytes(url: string): Promise<{
  bytes: Buffer
  ext: string
}> {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('Image URL must be http(s)')
  }
  const response = await axios.get<ArrayBuffer>(url, {
    responseType: 'arraybuffer',
    timeout: 25000,
    maxContentLength: MAX_IMAGE_BYTES,
    maxBodyLength: MAX_IMAGE_BYTES,
    validateStatus: (status) => status === 200,
    headers: DOWNLOAD_HEADERS
  })
  const bytes = Buffer.from(response.data)
  const ext =
    sniffImageExt(bytes) ||
    extFromUrl(url, String(response.headers['content-type'] ?? ''))
  if (!ext || !ALLOWED_EXT.has(ext)) {
    throw new Error(`Unsupported image type: ${ext || 'unknown'}`)
  }
  if (bytes.length < 32) {
    throw new Error('Downloaded image is empty')
  }
  return { bytes, ext }
}

export async function setCollectionGameArtFromUrl(args: {
  appName: string
  runner: Runner
  kind: CollectionArtKind
  imageUrl: string
  thumbUrl?: string
}): Promise<CollectionGameArt> {
  const urls = [args.imageUrl, args.thumbUrl].filter((url): url is string =>
    Boolean(url)
  )
  let lastError: unknown
  for (const url of urls) {
    try {
      const { bytes, ext } = await downloadImageBytes(url)
      const dest = destFile(args.runner, args.appName, args.kind, ext)
      writeFileSync(dest, bytes)
      return applyArtFile(args.runner, args.appName, args.kind, dest)
    } catch (error) {
      lastError = error
      const status = isAxiosError(error) ? error.response?.status : undefined
      logWarning(
        `Collection art download failed for ${url}${
          status ? ` (${status})` : ''
        }: ${String(error)}`,
        LogPrefix.Backend
      )
    }
  }
  throw new Error(`Could not download image: ${String(lastError)}`)
}

export function clearCollectionGameArt(args: {
  appName: string
  runner: Runner
  kind: CollectionArtKind
}): CollectionGameArt {
  const current = getCollectionGameArt(args.runner, args.appName)
  if (args.kind === 'cover') {
    removeManaged(current.coverUrl)
    delete current.coverUrl
  } else {
    removeManaged(current.heroUrl)
    delete current.heroUrl
  }
  return writeArt(args.runner, args.appName, current)
}

export function removeAllCollectionGameArt(runner: Runner, appName: string) {
  clearCollectionGameArt({ appName, runner, kind: 'cover' })
  clearCollectionGameArt({ appName, runner, kind: 'hero' })
}
