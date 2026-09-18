import { existsSync } from 'graceful-fs'
import { join, resolve, sep } from 'path'
import { pathToFileURL } from 'url'
import { app, net, protocol } from 'electron'

const SCHEME = 'localart'

let registered = false
let schemeRegistered = false

function libraryRoot() {
  return resolve(join(app.getPath('userData'), 'local_library'))
}

function isInside(root: string, target: string) {
  const base = root.endsWith(sep) ? root : root + sep
  return target === root || target.startsWith(base)
}

export function localArtUrl(
  kind: 'heroes' | 'art' | 'metadata-art',
  ...segments: string[]
) {
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
    parsed.hostname === 'metadata-art'
      ? [parsed.hostname, ...fromPath]
      : fromPath

  if (
    parts[0] !== 'heroes' &&
    parts[0] !== 'art' &&
    parts[0] !== 'metadata-art'
  ) {
    return null
  }
  if (parts.some((part) => part === '..' || part === '.')) return null

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
    return net.fetch(pathToFileURL(filePath).href)
  })
}
