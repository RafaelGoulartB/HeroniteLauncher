import { createHash } from 'crypto'
import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  unlink,
  utimes,
  writeFile
} from 'fs/promises'
import { join } from 'path'
import { app } from 'electron'
import type { CollectionScreenshotCacheInfo } from 'common/types/local-library'
import { getCollectionSettings } from '../settings'

const THUMBNAIL_WIDTH = 320
const THUMBNAIL_HEIGHT = 180
const THUMBNAIL_QUALITY = 60
const MAX_CONCURRENT_JOBS = 2

const pending = new Map<string, Promise<string | null>>()
const writingCachePaths = new Set<string>()
const queue: (() => void)[] = []
let activeJobs = 0
let cacheGeneration = 0
let maintenanceJob: Promise<CollectionScreenshotCacheInfo> | null = null
let maintenanceRequested = false
let maintenanceTimer: NodeJS.Timeout | null = null

export function thumbnailCacheRoot() {
  return join(app.getPath('userData'), 'local_library', 'screenshot-thumbnails')
}

function cacheLimitBytes() {
  return getCollectionSettings().screenshots.cacheLimitMb * 1024 * 1024
}

function cachePathFor(sourcePath: string) {
  const digest = createHash('sha256')
    .update(
      `${sourcePath}\0${THUMBNAIL_WIDTH}x${THUMBNAIL_HEIGHT}q${THUMBNAIL_QUALITY}`
    )
    .digest('hex')
  return join(thumbnailCacheRoot(), `${digest}.jpg`)
}

function runQueued(task: () => Promise<string | null>): Promise<string | null> {
  return new Promise((resolve) => {
    const run = () => {
      activeJobs += 1
      void task()
        .then(resolve)
        .catch(() => resolve(null))
        .finally(() => {
          activeJobs -= 1
          queue.shift()?.()
        })
    }

    if (activeJobs < MAX_CONCURRENT_JOBS) run()
    else queue.push(run)
  })
}

async function currentThumbnailPath(
  sourcePath: string,
  cachePath: string
): Promise<string | null> {
  try {
    const [sourceStats, cacheStats] = await Promise.all([
      stat(sourcePath),
      stat(cachePath)
    ])
    if (cacheStats.size > 0 && cacheStats.mtimeMs >= sourceStats.mtimeMs) {
      void utimes(cachePath, new Date(), cacheStats.mtime).catch(
        () => undefined
      )
      return cachePath
    }
  } catch {
    // A missing or stale cache entry is generated below.
  }
  return null
}

export async function getScreenshotThumbnailPath(
  sourcePath: string
): Promise<string | null> {
  const cacheRoot = thumbnailCacheRoot()
  const cachePath = cachePathFor(sourcePath)
  const metadataPath = `${cachePath}.json`
  const cached = await currentThumbnailPath(sourcePath, cachePath)
  if (cached) return cached

  const existing = pending.get(cachePath)
  if (existing) return existing

  const generation = cacheGeneration
  const job = runQueued(async () => {
    if (generation !== cacheGeneration) return null
    const cachedAfterQueue = await currentThumbnailPath(sourcePath, cachePath)
    if (cachedAfterQueue) return cachedAfterQueue

    const { default: imageProcessor } = await import('sharp')
    await mkdir(cacheRoot, { recursive: true })
    writingCachePaths.add(cachePath)
    try {
      await imageProcessor(sourcePath, { animated: false })
        .rotate()
        .resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, {
          fit: 'cover',
          withoutEnlargement: true
        })
        .jpeg({ quality: THUMBNAIL_QUALITY })
        .toFile(cachePath)
      if (generation !== cacheGeneration) return null
      await writeFile(metadataPath, JSON.stringify({ sourcePath }))
    } finally {
      writingCachePaths.delete(cachePath)
    }
    scheduleScreenshotThumbnailCacheMaintenance()
    return cachePath
  })

  pending.set(cachePath, job)
  void job.finally(() => pending.delete(cachePath))
  return job
}

type CacheEntry = {
  imagePath: string
  metadataPath: string
  size: number
  lastAccess: number
}

async function removeCacheEntry(entry: CacheEntry) {
  await Promise.all([
    unlink(entry.imagePath).catch(() => undefined),
    unlink(entry.metadataPath).catch(() => undefined)
  ])
}

async function scanCache(): Promise<CacheEntry[]> {
  const root = thumbnailCacheRoot()
  let names: string[]
  try {
    names = await readdir(root)
  } catch {
    return []
  }

  const imageNames = names.filter(
    (name) => name.endsWith('.jpg') && !writingCachePaths.has(join(root, name))
  )
  const imageNameSet = new Set(names.filter((name) => name.endsWith('.jpg')))
  await Promise.all(
    names
      .filter(
        (name) =>
          name.endsWith('.jpg.json') &&
          !imageNameSet.has(name.slice(0, -5)) &&
          !writingCachePaths.has(join(root, name.slice(0, -5)))
      )
      .map((name) => unlink(join(root, name)).catch(() => undefined))
  )
  const entries = await Promise.all(
    imageNames.map(async (name): Promise<CacheEntry | null> => {
      const imagePath = join(root, name)
      const metadataPath = `${imagePath}.json`
      try {
        const [imageStats, metadata] = await Promise.all([
          stat(imagePath),
          readFile(metadataPath, 'utf8')
        ])
        const parsed = JSON.parse(metadata) as { sourcePath?: unknown }
        if (typeof parsed.sourcePath !== 'string') throw new Error()
        await stat(parsed.sourcePath)
        const metadataStats = await stat(metadataPath)
        return {
          imagePath,
          metadataPath,
          size: imageStats.size + metadataStats.size,
          lastAccess: imageStats.atimeMs
        }
      } catch {
        await Promise.all([
          unlink(imagePath).catch(() => undefined),
          unlink(metadataPath).catch(() => undefined)
        ])
        return null
      }
    })
  )
  return entries.filter((entry): entry is CacheEntry => Boolean(entry))
}

async function runMaintenance(): Promise<CollectionScreenshotCacheInfo> {
  const limitBytes = cacheLimitBytes()
  const entries = await scanCache()
  let sizeBytes = entries.reduce((total, entry) => total + entry.size, 0)
  let itemCount = entries.length

  if (sizeBytes > limitBytes) {
    const oldestFirst = [...entries].sort(
      (left, right) => left.lastAccess - right.lastAccess
    )
    for (const entry of oldestFirst) {
      if (sizeBytes <= limitBytes) break
      await removeCacheEntry(entry)
      sizeBytes -= entry.size
      itemCount -= 1
    }
  }

  return { sizeBytes, itemCount, limitBytes }
}

export function maintainScreenshotThumbnailCache() {
  maintenanceRequested = true
  if (maintenanceJob) return maintenanceJob
  maintenanceJob = (async () => {
    let info: CollectionScreenshotCacheInfo
    do {
      maintenanceRequested = false
      info = await runMaintenance()
    } while (maintenanceRequested)
    return info
  })().finally(() => {
    maintenanceJob = null
  })
  return maintenanceJob
}

function scheduleScreenshotThumbnailCacheMaintenance() {
  if (maintenanceTimer) clearTimeout(maintenanceTimer)
  maintenanceTimer = setTimeout(() => {
    maintenanceTimer = null
    void maintainScreenshotThumbnailCache()
  }, 1500)
  maintenanceTimer.unref()
}

export async function clearScreenshotThumbnailCache() {
  cacheGeneration += 1
  if (maintenanceTimer) {
    clearTimeout(maintenanceTimer)
    maintenanceTimer = null
  }
  await Promise.allSettled([...pending.values()])
  await rm(thumbnailCacheRoot(), { recursive: true, force: true })
  return {
    sizeBytes: 0,
    itemCount: 0,
    limitBytes: cacheLimitBytes()
  } satisfies CollectionScreenshotCacheInfo
}
