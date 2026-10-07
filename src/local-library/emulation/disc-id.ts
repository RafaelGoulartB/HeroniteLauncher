import { open, readFile } from 'fs/promises'
import type { FileHandle } from 'fs/promises'
import { dirname, extname, isAbsolute, join } from 'path'

// Reads the identifiers emulators use to name save states (PS1/PS2 serial,
// PSP disc ID, GameCube/Wii game ID) straight from uncompressed disc images.
// Compressed formats (CHD, CSO, GCZ) return undefined; callers fall back to
// the emulator's game list cache or to a key learned after a session.

const SECTOR = 2048
const RAW_SECTOR = 2352
const SYNC = Buffer.from([
  0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00
])

type SectorLayout = { size: number; offset: number }

async function readAt(
  handle: FileHandle,
  position: number,
  length: number
): Promise<Buffer> {
  const buffer = Buffer.alloc(length)
  const { bytesRead } = await handle.read(buffer, 0, length, position)
  return buffer.subarray(0, bytesRead)
}

async function detectLayout(handle: FileHandle): Promise<SectorLayout> {
  const head = await readAt(handle, 0, 16)
  if (head.length === 16 && head.subarray(0, 12).equals(SYNC)) {
    return { size: RAW_SECTOR, offset: head[15] === 2 ? 24 : 16 }
  }
  return { size: SECTOR, offset: 0 }
}

async function readLogical(
  handle: FileHandle,
  layout: SectorLayout,
  lba: number,
  length: number
): Promise<Buffer> {
  const chunks: Buffer[] = []
  let remaining = length
  let sector = lba
  while (remaining > 0) {
    const take = Math.min(SECTOR, remaining)
    const chunk = await readAt(
      handle,
      sector * layout.size + layout.offset,
      take
    )
    if (!chunk.length) break
    chunks.push(chunk)
    remaining -= take
    sector++
  }
  return Buffer.concat(chunks)
}

type DirEntry = { name: string; lba: number; size: number; isDir: boolean }

function parseDirectory(data: Buffer): DirEntry[] {
  const entries: DirEntry[] = []
  let pos = 0
  while (pos < data.length) {
    const length = data[pos]
    if (!length) {
      pos = (Math.floor(pos / SECTOR) + 1) * SECTOR
      continue
    }
    const nameLength = data[pos + 32]
    const rawName = data.toString('latin1', pos + 33, pos + 33 + nameLength)
    entries.push({
      name: rawName.replace(/;\d+$/, '').toUpperCase(),
      lba: data.readUInt32LE(pos + 2),
      size: data.readUInt32LE(pos + 10),
      isDir: (data[pos + 25] & 0x02) !== 0
    })
    pos += length
  }
  return entries
}

async function readIsoFile(
  imagePath: string,
  filePath: string[],
  maxBytes = 64 * 1024
): Promise<Buffer | undefined> {
  let handle: FileHandle | undefined
  try {
    handle = await open(imagePath, 'r')
    const layout = await detectLayout(handle)
    const pvd = await readLogical(handle, layout, 16, SECTOR)
    if (pvd.toString('latin1', 1, 6) !== 'CD001') return undefined
    let dirLba = pvd.readUInt32LE(156 + 2)
    let dirSize = pvd.readUInt32LE(156 + 10)
    for (let index = 0; index < filePath.length; index++) {
      const want = filePath[index].toUpperCase()
      const listing = await readLogical(
        handle,
        layout,
        dirLba,
        Math.min(dirSize, 256 * 1024)
      )
      const entry = parseDirectory(listing).find((item) => item.name === want)
      if (!entry) return undefined
      if (index === filePath.length - 1) {
        if (entry.isDir) return undefined
        return readLogical(
          handle,
          layout,
          entry.lba,
          Math.min(entry.size, maxBytes)
        )
      }
      if (!entry.isDir) return undefined
      dirLba = entry.lba
      dirSize = entry.size
    }
    return undefined
  } catch {
    return undefined
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

// `.cue` / `.m3u` point at the real image; follow them to the first data file.
async function resolveImagePath(romPath: string): Promise<string> {
  const ext = extname(romPath).toLowerCase()
  if (ext !== '.cue' && ext !== '.m3u') return romPath
  try {
    const text = await readFile(romPath, 'utf8')
    let target: string | undefined
    if (ext === '.cue') {
      target = /^\s*FILE\s+"?([^"\r\n]+?)"?\s+\w+\s*$/im.exec(text)?.[1]
    } else {
      target = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line && !line.startsWith('#'))
    }
    if (!target) return romPath
    const resolved = isAbsolute(target)
      ? target
      : join(dirname(romPath), target)
    return resolveImagePath(resolved)
  } catch {
    return romPath
  }
}

function serialFromSystemCnf(text: string): string | undefined {
  const boot = /^\s*BOOT2?\s*=\s*(\S+)/im.exec(text)?.[1]
  if (!boot) return undefined
  const file = boot.split(/[\\/:]/).pop() ?? ''
  const match = /^([A-Z]{4})[_-](\d{3})\.(\d{2})/i.exec(file)
  if (!match) return undefined
  return `${match[1].toUpperCase()}-${match[2]}${match[3]}`
}

export async function readPlayStationSerial(
  romPath: string
): Promise<string | undefined> {
  const image = await resolveImagePath(romPath)
  const cnf = await readIsoFile(image, ['SYSTEM.CNF'])
  return cnf ? serialFromSystemCnf(cnf.toString('latin1')) : undefined
}

// PARAM.SFO: 'PSF' header, key table, data table, 16-byte index entries.
export function readSfo(data: Buffer): Record<string, string> {
  const result: Record<string, string> = {}
  if (data.length < 20 || data.toString('latin1', 0, 4) !== '\0PSF') {
    return result
  }
  const keyTable = data.readUInt32LE(8)
  const dataTable = data.readUInt32LE(12)
  const count = data.readUInt32LE(16)
  for (let index = 0; index < count; index++) {
    const entry = 20 + index * 16
    if (entry + 16 > data.length) break
    const keyStart = keyTable + data.readUInt16LE(entry)
    const format = data.readUInt16LE(entry + 2)
    const length = data.readUInt32LE(entry + 4)
    const valueStart = dataTable + data.readUInt32LE(entry + 12)
    const keyEnd = data.indexOf(0, keyStart)
    if (keyEnd < 0 || format !== 0x0204) continue
    result[data.toString('latin1', keyStart, keyEnd)] = data
      .toString('utf8', valueStart, valueStart + length)
      .replace(/\0+$/, '')
  }
  return result
}

export async function readPspDiscId(
  romPath: string
): Promise<string | undefined> {
  const image = await resolveImagePath(romPath)
  const sfo = await readIsoFile(image, ['PSP_GAME', 'PARAM.SFO'])
  const discId = sfo && readSfo(sfo).DISC_ID
  if (discId && /^[A-Z0-9]{9}$/.test(discId)) return discId
  const umd = await readIsoFile(image, ['UMD_DATA.BIN'], 64)
  const match = umd && /^([A-Z]{4})-?(\d{5})/.exec(umd.toString('latin1'))
  return match ? `${match[1]}${match[2]}` : undefined
}

// RPCS3 keys states by TITLE_ID; games are folders (…/PS3_GAME/USRDIR/EBOOT.BIN)
// or ISO images.
export async function readPs3TitleId(
  romPath: string
): Promise<string | undefined> {
  const pick = (data?: Buffer) => {
    const id = data && readSfo(data).TITLE_ID
    return id && /^[A-Z]{4}\d{5}$/.test(id) ? id : undefined
  }
  if (extname(romPath).toLowerCase() === '.iso') {
    return pick(await readIsoFile(romPath, ['PS3_GAME', 'PARAM.SFO']))
  }
  let dir = /\.bin$/i.test(romPath) ? dirname(romPath) : romPath
  for (let depth = 0; depth < 3; depth++) {
    for (const candidate of [
      join(dir, 'PARAM.SFO'),
      join(dir, 'PS3_GAME', 'PARAM.SFO')
    ]) {
      const id = pick(await readFile(candidate).catch(() => undefined))
      if (id) return id
    }
    dir = dirname(dir)
  }
  return undefined
}

export async function readNintendoDiscId(
  romPath: string
): Promise<string | undefined> {
  const ext = extname(romPath).toLowerCase()
  const offset =
    ext === '.rvz' || ext === '.wia' ? 0x58 : ext === '.wbfs' ? 0x200 : 0
  if (!['.iso', '.gcm', '.rvz', '.wia', '.wbfs'].includes(ext)) {
    return undefined
  }
  let handle: FileHandle | undefined
  try {
    handle = await open(romPath, 'r')
    const id = (await readAt(handle, offset, 6)).toString('latin1')
    return /^[A-Z0-9]{6}$/.test(id) ? id : undefined
  } catch {
    return undefined
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

// PCSX2 and DuckStation keep a binary game list cache where each entry starts
// with the u32-length-prefixed file path followed by the serial. Matching the
// path and validating the next string keeps this tolerant of format changes.
export async function serialFromGameListCache(
  cachePath: string,
  romPath: string
): Promise<string | undefined> {
  let data: Buffer
  try {
    data = await readFile(cachePath)
  } catch {
    return undefined
  }
  const needle = Buffer.from(romPath, 'utf8')
  let from = 0
  while (from < data.length) {
    const at = data.indexOf(needle, from)
    if (at < 4) {
      if (at < 0) return undefined
      from = at + 1
      continue
    }
    const pathLength = data.readUInt32LE(at - 4)
    const next = at + needle.length
    if (pathLength === needle.length && next + 4 <= data.length) {
      const serialLength = data.readUInt32LE(next)
      if (serialLength > 0 && serialLength < 32) {
        const serial = data.toString('utf8', next + 4, next + 4 + serialLength)
        if (/^[A-Z0-9][A-Z0-9_-]{3,}$/i.test(serial)) return serial
      }
    }
    from = at + 1
  }
  return undefined
}
