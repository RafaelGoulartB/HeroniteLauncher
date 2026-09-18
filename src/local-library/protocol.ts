import { existsSync } from 'graceful-fs'
import { join, resolve, sep } from 'path'
import { pathToFileURL } from 'url'
import { app, net, protocol } from 'electron'
import { getCollectionSettings } from './settings'
import { getScreenshotThumbnail } from './screenshots/thumbnails'

const SCHEME = 'localart'
const IMAGE_EXT = new Set([
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'bmp',
  'avif',
  'jxl',
  'jxr'
])

let registered = false
let schemeRegistered = false

type LocalArtKind = 'heroes' | 'art' | 'metadata-art' | 'screenshots'

function libraryRoot() {
  return resolve(join(app.getPath('userData'), 'local_library'))
}

export function screenshotsRoot(): string | null {
  const folder = getCollectionSettings().screenshots?.folder?.trim()
  return folder ? resolve(folder) : null
}

function isInside(root: string, target: string) {
  const base = root.endsWith(sep) ? root : root + sep
  return target === root || target.startsWith(base)
}

function isImagePath(target: string) {
  const ext = target.split('.').pop()?.toLowerCase()
  return Boolean(ext && IMAGE_EXT.has(ext))
}

export function localArtUrl(kind: LocalArtKind, ...segments: string[]) {
  return `${SCHEME}://${kind}/${segments.map(encodeURIComponent).join('/')}`
}

export function localArtFilePath(url: string): string | null {
  if (!url.startsWith(`${SCHEME}:`)) return null
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  const fromPath = parsed.pathname
    .split('/')
    .filter(Boolean)
    .map((part) => decodeURIComponent(part))
  const parts =
    parsed.hostname === 'heroes' ||
    parsed.hostname === 'art' ||
    parsed.hostname === 'metadata-art' ||
    parsed.hostname === 'screenshots'
      ? [parsed.hostname, ...fromPath]
      : fromPath

  if (
    parts[0] !== 'heroes' &&
    parts[0] !== 'art' &&
    parts[0] !== 'metadata-art' &&
    parts[0] !== 'screenshots'
  ) {
    return null
  }
  if (parts.some((part) => part === '..' || part === '.')) return null

  if (parts[0] === 'screenshots') {
    const root = screenshotsRoot()
    if (!root) return null
    const target = resolve(join(root, ...parts.slice(1)))
    if (
      !isInside(root, target) ||
      !existsSync(target) ||
      !isImagePath(target)
    ) {
      return null
    }
    return target
  }

  const root = libraryRoot()
  const target = resolve(join(root, ...parts))
  if (!isInside(root, target) || !existsSync(target)) return null
  return target
}

export function registerLocalArtScheme() {
  if (schemeRegistered) return
  schemeRegistered = true
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        bypassCSP: true,
        stream: true
      }
    }
  ])
}

export function initLocalArtProtocol() {
  if (registered) return
  registered = true

  protocol.handle(SCHEME, async (request) => {
    const filePath = localArtFilePath(request.url)
    if (!filePath) {
      return new Response('Not found', { status: 404 })
    }

    const parsed = new URL(request.url)
    if (
      parsed.hostname === 'screenshots' &&
      parsed.searchParams.get('preview') === '1'
    ) {
      const thumbnail = await getScreenshotThumbnail(filePath)
      if (!thumbnail) {
        return new Response('Preview unavailable', { status: 415 })
      }
      return new Response(new Uint8Array(thumbnail), {
        headers: {
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'no-store'
        }
      })
    }

    return net.fetch(pathToFileURL(filePath).href)
  })
}
