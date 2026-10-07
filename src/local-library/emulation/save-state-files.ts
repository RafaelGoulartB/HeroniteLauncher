import { open, readFile } from 'fs/promises'
import type { FileHandle } from 'fs/promises'
import { homedir } from 'os'
import { isAbsolute, join, resolve } from 'path'
import { inflateRawSync } from 'zlib'

export function xdgConfigHome(): string {
  return process.env.XDG_CONFIG_HOME || join(homedir(), '.config')
}

export function xdgDataHome(): string {
  return process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share')
}

export function flatpakDir(
  flatpakId: string,
  kind: 'config' | 'data',
  ...rest: string[]
): string {
  return join(homedir(), '.var', 'app', flatpakId, kind, ...rest)
}

export type IniFile = Map<string, Map<string, string>>

// Plain `key = value` INI and RetroArch-style `key = "value"` files.
export async function readIni(path: string): Promise<IniFile | undefined> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch {
    return undefined
  }
  const sections: IniFile = new Map()
  let current = new Map<string, string>()
  sections.set('', current)
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith(';') || line.startsWith('#')) continue
    const section = /^\[(.+)\]$/.exec(line)
    if (section) {
      current = sections.get(section[1]) ?? new Map<string, string>()
      sections.set(section[1], current)
      continue
    }
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const key = line.slice(0, eq).trim()
    const value = line
      .slice(eq + 1)
      .trim()
      .replace(/^"(.*)"$/, '$1')
    current.set(key, value)
  }
  return sections
}

export function iniValue(
  ini: IniFile | undefined,
  section: string,
  key: string
): string | undefined {
  const value = ini?.get(section)?.get(key)
  return value || undefined
}

export function resolveConfiguredDir(
  value: string | undefined,
  base: string
): string | undefined {
  if (!value || value === 'default') return undefined
  const expanded = value.replace(/^~(?=\/|$)/, homedir())
  return isAbsolute(expanded) ? expanded : resolve(base, expanded)
}

async function readAt(
  handle: FileHandle,
  position: number,
  length: number
): Promise<Buffer> {
  const buffer = Buffer.alloc(length)
  const { bytesRead } = await handle.read(buffer, 0, length, position)
  return buffer.subarray(0, bytesRead)
}

// Reads one stored or deflated entry from a ZIP archive (PCSX2 `.p2s` keeps
// its `Screenshot.png` stored uncompressed next to zstd-compressed memory).
export async function readZipEntry(
  path: string,
  entryName: string
): Promise<Buffer | undefined> {
  let handle: FileHandle | undefined
  try {
    handle = await open(path, 'r')
    const { size } = await handle.stat()
    const tailLength = Math.min(size, 65557)
    const tail = await readAt(handle, size - tailLength, tailLength)
    const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
    if (eocd < 0) return undefined
    const dirSize = tail.readUInt32LE(eocd + 12)
    const dirOffset = tail.readUInt32LE(eocd + 16)
    const dir = await readAt(handle, dirOffset, dirSize)
    let pos = 0
    while (pos + 46 <= dir.length && dir.readUInt32LE(pos) === 0x02014b50) {
      const method = dir.readUInt16LE(pos + 10)
      const compressedSize = dir.readUInt32LE(pos + 20)
      const nameLength = dir.readUInt16LE(pos + 28)
      const extraLength = dir.readUInt16LE(pos + 30)
      const commentLength = dir.readUInt16LE(pos + 32)
      const localOffset = dir.readUInt32LE(pos + 42)
      const name = dir.toString('utf8', pos + 46, pos + 46 + nameLength)
      if (name === entryName) {
        const local = await readAt(handle, localOffset, 30)
        if (local.length < 30 || local.readUInt32LE(0) !== 0x04034b50) {
          return undefined
        }
        const start =
          localOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28)
        const data = await readAt(handle, start, compressedSize)
        if (method === 0) return data
        if (method === 8) return inflateRawSync(data)
        return undefined
      }
      pos += 46 + nameLength + extraLength + commentLength
    }
    return undefined
  } catch {
    return undefined
  } finally {
    await handle?.close().catch(() => undefined)
  }
}
