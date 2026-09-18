import { BrowserWindow } from 'electron'
import { getMainWindow } from 'backend/main_window'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import type {
  CollectionWebImage,
  CollectionWebImageSearchArgs
} from 'common/types/local-library'

const PARTITION = 'persist:collection-web-images'
const DDG_TIMEOUT_MS = 10000
const SEARCH_TIMEOUT_MS = 25000

type DdgImageResult = {
  height?: number
  width?: number
  thumbnail?: string
  image?: string
}

type DdgSearchResponse = {
  results?: DdgImageResult[]
}

type FetchPaused = {
  requestId: string
  request?: { url?: string }
  responseStatusCode?: number
}

let searchChain: Promise<unknown> = Promise.resolve()

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    )
  })
}

function chromeUserAgent(win: BrowserWindow) {
  return win.webContents.getUserAgent().replace(/\sElectron\/\S+/g, '')
}

function asHttpUrl(value?: string) {
  if (!value) return ''
  try {
    const decoded = value.replace(/\\u003d/g, '=').replace(/\\u0026/g, '&')
    const url = new URL(decoded)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    return url.toString()
  } catch {
    return ''
  }
}

function mapImages(payload?: DdgSearchResponse): CollectionWebImage[] {
  const seen = new Set<string>()
  const images: CollectionWebImage[] = []
  for (const item of payload?.results ?? []) {
    const imageUrl = asHttpUrl(item.image)
    const thumbUrl = asHttpUrl(item.thumbnail) || imageUrl
    if (!imageUrl || seen.has(imageUrl)) continue
    seen.add(imageUrl)
    images.push({
      imageUrl,
      thumbUrl,
      width: Number(item.width) || 0,
      height: Number(item.height) || 0
    })
  }
  return images
}

function parseGoogleHtml(html: string): CollectionWebImage[] {
  const images: CollectionWebImage[] = []
  const seen = new Set<string>()
  const formatted = html.replace(/\r\n?|\n/g, '')
  const matches = formatted.matchAll(
    /\["(https:\/\/encrypted-[^,]+?)",\d+,\d+\],\["(http.+?)",(\d+),(\d+)\]/g
  )
  for (const match of matches) {
    const imageUrl = asHttpUrl(match[2])
    const thumbUrl = asHttpUrl(match[1]) || imageUrl
    if (!imageUrl || seen.has(imageUrl)) continue
    seen.add(imageUrl)
    images.push({
      imageUrl,
      thumbUrl,
      width: Number(match[4]) || 0,
      height: Number(match[3]) || 0
    })
  }
  return images
}

function searchPageUrl(query: string, transparent: boolean) {
  const url = new URL('https://duckduckgo.com/')
  url.searchParams.set('ia', 'images')
  url.searchParams.set('iax', 'images')
  url.searchParams.set('q', query)
  if (transparent) url.searchParams.set('iaf', 'type:transparent')
  return url.toString()
}

function googlePageUrl(query: string, transparent: boolean) {
  const url = new URL('https://www.google.com/search')
  url.searchParams.set('tbm', 'isch')
  url.searchParams.set('client', 'firefox-b-d')
  url.searchParams.set('source', 'lnt')
  url.searchParams.set('q', query)
  if (transparent) url.searchParams.set('tbs', 'ic:trans')
  return url.toString()
}

function createSearchBrowser() {
  const parent = getMainWindow()
  const linux = process.platform === 'linux'
  const win = new BrowserWindow({
    parent: parent && !parent.isDestroyed() ? parent : undefined,
    show: true,
    width: linux ? 16 : 1280,
    height: linux ? 16 : 900,
    x: 0,
    y: 0,
    opacity: 0,
    focusable: false,
    skipTaskbar: true,
    frame: false,
    transparent: linux,
    hasShadow: false,
    backgroundColor: '#00000000',
    paintWhenInitiallyHidden: true,
    webPreferences: {
      partition: PARTITION,
      offscreen: !linux,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })
  try {
    win.setIgnoreMouseEvents(true)
  } catch {
    /* some WMs reject this */
  }
  win.setMenuBarVisibility(false)
  win.webContents.setAudioMuted(true)
  win.webContents.setUserAgent(chromeUserAgent(win))
  win.webContents.on('paint', () => undefined)
  if (parent && !parent.isDestroyed()) parent.focus()
  return win
}

function destroyWindow(win?: BrowserWindow) {
  if (!win || win.isDestroyed()) return
  win.destroy()
}

async function attachFetch(win: BrowserWindow) {
  const dbg = win.webContents.debugger
  if (dbg.isAttached()) dbg.detach()
  dbg.attach('1.3')
  await dbg.sendCommand('Fetch.enable', {
    patterns: [
      {
        urlPattern: '*duckduckgo.com/i.js*',
        requestStage: 'Response'
      }
    ]
  })
  return dbg
}

async function captureDdgImages(
  win: BrowserWindow,
  pageUrl: string
): Promise<CollectionWebImage[]> {
  const dbg = await withTimeout(
    attachFetch(win),
    3000,
    'Could not attach image search debugger'
  )

  return new Promise((resolve, reject) => {
    let settled = false

    const finish = (error?: Error, images?: CollectionWebImage[]) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      dbg.removeListener('message', onMessage)
      void dbg.sendCommand('Fetch.disable').catch(() => undefined)
      try {
        if (dbg.isAttached()) dbg.detach()
      } catch {
        /* already gone */
      }
      if (error) reject(error)
      else resolve(images ?? [])
    }

    const timer = setTimeout(() => {
      finish(new Error('DuckDuckGo image intercept timed out'))
    }, DDG_TIMEOUT_MS)

    const onMessage = (_event: unknown, method: string, params: unknown) => {
      if (method !== 'Fetch.requestPaused') return
      const paused = params as FetchPaused
      const url = paused.request?.url ?? ''
      void (async () => {
        try {
          if (
            url.includes('duckduckgo.com/i.js') &&
            paused.responseStatusCode === 200
          ) {
            const body = (await dbg.sendCommand('Fetch.getResponseBody', {
              requestId: paused.requestId
            })) as { body: string; base64Encoded: boolean }
            const text = body.base64Encoded
              ? Buffer.from(body.body, 'base64').toString('utf8')
              : body.body
            const images = mapImages(JSON.parse(text) as DdgSearchResponse)
            await dbg.sendCommand('Fetch.continueRequest', {
              requestId: paused.requestId
            })
            if (images.length) {
              finish(undefined, images)
              return
            }
          } else {
            await dbg.sendCommand('Fetch.continueRequest', {
              requestId: paused.requestId
            })
          }
        } catch (error) {
          try {
            await dbg.sendCommand('Fetch.continueRequest', {
              requestId: paused.requestId
            })
          } catch {
            /* ignore */
          }
          logWarning(
            `DuckDuckGo Fetch intercept failed: ${String(error)}`,
            LogPrefix.Backend
          )
        }
      })()
    }

    dbg.on('message', onMessage)
    void win.loadURL(pageUrl).catch((error: Error) => finish(error))
  })
}

async function loadUrlSafe(win: BrowserWindow, url: string) {
  try {
    await win.loadURL(url)
  } catch (error) {
    logWarning(`Web image search load failed for ${url}: ${String(error)}`, {
      prefix: LogPrefix.Backend
    })
  }
}

async function fetchGoogleImages(
  win: BrowserWindow,
  query: string,
  transparent: boolean
): Promise<CollectionWebImage[]> {
  const pageUrl = googlePageUrl(query, transparent)
  await loadUrlSafe(win, pageUrl)

  if (win.webContents.getURL().startsWith('https://consent.google.com')) {
    await win.webContents.executeJavaScript(
      'document.getElementsByTagName("form")[0]?.submit()'
    )
    await wait(3000)
    await loadUrlSafe(win, pageUrl)
  }

  const html = (await win.webContents.executeJavaScript(
    'document.documentElement.outerHTML'
  )) as string
  const fromMarkup = parseGoogleHtml(html)
  if (fromMarkup.length) return fromMarkup

  const rows = (await win.webContents.executeJavaScript(`
    [...document.querySelectorAll('a')].flatMap((anchor) => {
      try {
        const href = new URL(anchor.href, location.origin)
        const image = href.searchParams.get('imgurl') || ''
        const img = anchor.querySelector('img')
        if (!image) return []
        return [{
          image,
          thumbnail: img?.src || image,
          width: Number(img?.naturalWidth || 0),
          height: Number(img?.naturalHeight || 0)
        }]
      } catch {
        return []
      }
    })
  `)) as DdgImageResult[]

  return mapImages({ results: rows })
}

async function fetchBingImages(
  win: BrowserWindow,
  query: string
): Promise<CollectionWebImage[]> {
  const url = new URL('https://www.bing.com/images/search')
  url.searchParams.set('q', query)
  url.searchParams.set('form', 'HDRSC2')
  await loadUrlSafe(win, url.toString())

  const deadline = Date.now() + 8000
  while (Date.now() < deadline) {
    const count = (await win.webContents.executeJavaScript(
      'document.querySelectorAll("a.iusc").length'
    )) as number
    if (count > 0) break
    await wait(300)
  }

  const rows = (await win.webContents.executeJavaScript(`
    [...document.querySelectorAll('a.iusc')].map((el) => {
      try {
        const meta = JSON.parse(el.getAttribute('m') || '{}')
        return {
          image: meta.murl || '',
          thumbnail: meta.turl || '',
          width: Number(meta.ow || meta.width || 0),
          height: Number(meta.oh || meta.height || 0)
        }
      } catch {
        return null
      }
    }).filter(Boolean)
  `)) as DdgImageResult[]

  return mapImages({ results: rows })
}

async function fetchWebImages(
  query: string,
  transparent: boolean
): Promise<CollectionWebImage[]> {
  const win = createSearchBrowser()
  const ddgUrl = searchPageUrl(query, transparent)
  try {
    try {
      logInfo('Web image search: intercepting DuckDuckGo like Playnite', {
        prefix: LogPrefix.Backend
      })
      const images = await captureDdgImages(win, ddgUrl)
      if (images.length) return images
    } catch (error) {
      logWarning(
        `DuckDuckGo intercept failed: ${String(error)}`,
        LogPrefix.Backend
      )
    }

    try {
      logInfo('Web image search: parsing Google Images like Playnite', {
        prefix: LogPrefix.Backend
      })
      const images = await fetchGoogleImages(win, query, transparent)
      if (images.length) return images
    } catch (error) {
      logWarning(
        `Google image parse failed: ${String(error)}`,
        LogPrefix.Backend
      )
    }

    logInfo('Web image search: scraping Bing image results', {
      prefix: LogPrefix.Backend
    })
    return await fetchBingImages(win, query)
  } finally {
    destroyWindow(win)
  }
}

async function searchNow(
  args: CollectionWebImageSearchArgs
): Promise<CollectionWebImage[]> {
  const query = args.query.replace(/\s+/g, ' ').trim()
  if (!query) return []

  logInfo(`Web image search starting for "${query}"`, LogPrefix.Backend)

  try {
    const images = await withTimeout(
      fetchWebImages(query, Boolean(args.transparent)),
      SEARCH_TIMEOUT_MS,
      'Image search timed out'
    )
    logInfo(
      `Web image search for "${query}" returned ${images.length} result(s)`,
      LogPrefix.Backend
    )
    return images
  } catch (error) {
    if (args.transparent) {
      logWarning(
        `Transparent web image search failed, retrying without filter: ${String(
          error
        )}`,
        LogPrefix.Backend
      )
      return await withTimeout(
        fetchWebImages(query, false),
        SEARCH_TIMEOUT_MS,
        'Image search timed out'
      )
    }
    throw error
  }
}

export function searchCollectionWebImages(
  args: CollectionWebImageSearchArgs
): Promise<CollectionWebImage[]> {
  const run = searchChain.then(
    () => searchNow(args),
    () => searchNow(args)
  )
  searchChain = run.then(
    () => undefined,
    () => undefined
  )
  return run.then(
    (images) => images,
    (error) => {
      logWarning(`Web image search failed: ${String(error)}`, LogPrefix.Backend)
      throw new Error('Could not search images. Try another term.')
    }
  )
}
