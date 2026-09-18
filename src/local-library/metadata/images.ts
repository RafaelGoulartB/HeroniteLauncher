import {
  copyFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync
} from 'graceful-fs'
import { extname, join } from 'path'
import { app } from 'electron'
import axios from 'axios'
import { logWarning, LogPrefix } from 'backend/logger'
import { localArtUrl } from '../protocol'

const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'])
const MAX_IMAGE_BYTES = 2 * 1024 * 1024

function folderName(runner: string, appName: string) {
  return `${runner}_${appName}`.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120)
}

function metadataArtRoot() {
  return join(app.getPath('userData'), 'local_library', 'metadata-art')
}

export function removeMetadataArt(runner: string, appName: string) {
  const dir = join(metadataArtRoot(), folderName(runner, appName))
  if (!existsSync(dir)) return
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch (error) {
    logWarning(
      `Could not remove metadata art ${dir}: ${String(error)}`,
      LogPrefix.Backend
    )
  }
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
    bytes.length >= 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp'
  }
  return undefined
}

function destFile(
  runner: string,
  appName: string,
  kind: 'cover' | 'hero',
  ext: string
) {
  const dir = join(metadataArtRoot(), folderName(runner, appName))
  mkdirSync(dir, { recursive: true })
  return join(dir, `${kind}.${ext}`)
}

export function isRemoteImage(url?: string) {
  return Boolean(url && /^https?:\/\//i.test(url))
}

export function isLocalFile(url?: string) {
  return Boolean(url && !url.startsWith('http') && !url.startsWith('localart:'))
}

export async function materializeMetadataImage(args: {
  runner: string
  appName: string
  kind: 'cover' | 'hero'
  source?: string
  download: boolean
}): Promise<string | undefined> {
  const source = args.source?.trim()
  if (!source) return undefined
  if (source.startsWith('localart:')) return source

  if (isLocalFile(source)) {
    if (!existsSync(source)) return undefined
    const ext = extname(source).replace('.', '').toLowerCase() || 'jpg'
    if (!ALLOWED_EXT.has(ext)) return undefined
    const dest = destFile(
      args.runner,
      args.appName,
      args.kind,
      ext === 'jpeg' ? 'jpg' : ext
    )
    copyFileSync(source, dest)
    return localArtUrl(
      'metadata-art',
      folderName(args.runner, args.appName),
      `${args.kind}.${ext === 'jpeg' ? 'jpg' : ext}`
    )
  }

  if (!args.download || !isRemoteImage(source)) return source

  try {
    const response = await axios.get<ArrayBuffer>(source, {
      responseType: 'arraybuffer',
      timeout: 20000,
      maxContentLength: MAX_IMAGE_BYTES,
      maxBodyLength: MAX_IMAGE_BYTES,
      validateStatus: (status) => status === 200
    })
    const bytes = Buffer.from(response.data)
    const ext = sniffImageExt(bytes) || 'jpg'
    if (!ALLOWED_EXT.has(ext) || bytes.length < 32) return source
    const dest = destFile(args.runner, args.appName, args.kind, ext)
    writeFileSync(dest, bytes)
    return localArtUrl(
      'metadata-art',
      folderName(args.runner, args.appName),
      `${args.kind}.${ext}`
    )
  } catch (error) {
    logWarning(
      `Metadata image download skipped for ${source}: ${String(error)}`,
      LogPrefix.Backend
    )
    return source
  }
}
