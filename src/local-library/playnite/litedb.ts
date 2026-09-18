/**
 * LiteDB v4 / datafile v7 reader (4 KiB pages).
 * Ported from Playnite's FileReaderV7 so we do not depend on C# or LiteDB 5.
 */

const PAGE_SIZE = 4096
const HEADER_INFO = '** This is a LiteDB file **'
const UINT32_MAX = 0xffffffff

export type BsonValue =
  | null
  | boolean
  | number
  | string
  | BsonValue[]
  | { [key: string]: BsonValue }

export type BsonDocument = { [key: string]: BsonValue }

class ByteReader {
  private pos = 0

  constructor(private readonly buffer: Buffer) {}

  get position() {
    return this.pos
  }

  set position(value: number) {
    this.pos = value
  }

  skip(length: number) {
    this.pos += length
  }

  readByte() {
    const value = this.buffer[this.pos]
    this.pos += 1
    return value
  }

  readBoolean() {
    return this.readByte() !== 0
  }

  readUInt16() {
    const value = this.buffer.readUInt16LE(this.pos)
    this.pos += 2
    return value
  }

  readInt32() {
    const value = this.buffer.readInt32LE(this.pos)
    this.pos += 4
    return value
  }

  readUInt32() {
    const value = this.buffer.readUInt32LE(this.pos)
    this.pos += 4
    return value
  }

  readInt64() {
    const value = this.buffer.readBigInt64LE(this.pos)
    this.pos += 8
    return value
  }

  readDouble() {
    const value = this.buffer.readDoubleLE(this.pos)
    this.pos += 8
    return value
  }

  readBytes(count: number) {
    const slice = this.buffer.subarray(this.pos, this.pos + count)
    this.pos += count
    return Buffer.from(slice)
  }

  readFixedString(length: number) {
    const text = this.buffer
      .subarray(this.pos, this.pos + length)
      .toString('utf8')
    this.pos += length
    return text
  }

  readString() {
    const length = this.readInt32()
    return this.readFixedString(length)
  }

  readBsonString() {
    const length = this.readInt32()
    const text = this.buffer
      .subarray(this.pos, this.pos + length - 1)
      .toString('utf8')
    this.pos += length
    return text
  }

  readCString() {
    const start = this.pos
    while (this.pos < this.buffer.length && this.buffer[this.pos] !== 0) {
      this.pos += 1
    }
    const text = this.buffer.subarray(start, this.pos).toString('utf8')
    this.pos += 1
    return text
  }
}

function guidFromDotNetBytes(bytes: Buffer): string {
  const a = bytes.readUInt32LE(0).toString(16).padStart(8, '0')
  const b = bytes.readUInt16LE(4).toString(16).padStart(4, '0')
  const c = bytes.readUInt16LE(6).toString(16).padStart(4, '0')
  const d = bytes.subarray(8, 10).toString('hex')
  const e = bytes.subarray(10, 16).toString('hex')
  return `${a}-${b}-${c}-${d}-${e}`
}

function deserializeDocument(reader: ByteReader): BsonDocument {
  const length = reader.readInt32()
  const end = reader.position + length - 5
  const obj: BsonDocument = {}

  while (reader.position < end) {
    const { name, value } = readElement(reader)
    obj[name] = value
  }

  reader.readByte()
  return obj
}

function deserializeArray(reader: ByteReader): BsonValue[] {
  const length = reader.readInt32()
  const end = reader.position + length - 5
  const arr: BsonValue[] = []

  while (reader.position < end) {
    const { value } = readElement(reader)
    arr.push(value)
  }

  reader.readByte()
  return arr
}

function readElement(reader: ByteReader): { name: string; value: BsonValue } {
  const type = reader.readByte()
  const name = reader.readCString()

  switch (type) {
    case 0x01:
      return { name, value: reader.readDouble() }
    case 0x02:
      return { name, value: reader.readBsonString() }
    case 0x03:
      return { name, value: deserializeDocument(reader) }
    case 0x04:
      return { name, value: deserializeArray(reader) }
    case 0x05: {
      const length = reader.readInt32()
      const subType = reader.readByte()
      const bytes = reader.readBytes(length)
      if ((subType === 0x03 || subType === 0x04) && length === 16) {
        return { name, value: guidFromDotNetBytes(bytes) }
      }
      return { name, value: bytes.toString('hex') }
    }
    case 0x07:
      reader.readBytes(12)
      return { name, value: null }
    case 0x08:
      return { name, value: reader.readBoolean() }
    case 0x09: {
      const ts = reader.readInt64()
      if (ts === BigInt('253402300800000')) return { name, value: null }
      if (ts === BigInt('-62135596800000')) return { name, value: null }
      return { name, value: new Date(Number(ts)).toISOString() }
    }
    case 0x0a:
      return { name, value: null }
    case 0x10:
      return { name, value: reader.readInt32() }
    case 0x12:
      return { name, value: Number(reader.readInt64()) }
    case 0x13:
      reader.readBytes(16)
      return { name, value: null }
    case 0xff:
    case 0x7f:
      return { name, value: null }
    default:
      throw new Error(`Unsupported BSON type 0x${type.toString(16)}`)
  }
}

function deserializeBson(data: Buffer): BsonDocument {
  return deserializeDocument(new ByteReader(data))
}

type DataBlock = {
  index: number
  extendPageID: number
  data: Buffer
}

type Page = {
  pageID: number
  pageType: number
  nextPageID: number
  itemCount: number
  blocks: DataBlock[]
  extendData: Buffer
}

function parsePage(file: Buffer, pageID: number): Page | null {
  const offset = pageID * PAGE_SIZE
  if (offset + PAGE_SIZE > file.length) return null

  const reader = new ByteReader(file.subarray(offset, offset + PAGE_SIZE))
  const parsed: Page = {
    pageID: reader.readUInt32(),
    pageType: reader.readByte(),
    nextPageID: 0,
    itemCount: 0,
    blocks: [],
    extendData: Buffer.alloc(0)
  }

  reader.readUInt32() // prevPageID
  parsed.nextPageID = reader.readUInt32()
  parsed.itemCount = reader.readUInt16()
  reader.skip(2 + 8) // freeBytes + reserved

  if (parsed.pageType === 1) {
    const info = reader.readFixedString(27)
    const ver = reader.readByte()
    if (info !== HEADER_INFO || ver !== 7) {
      throw new Error('Not a LiteDB v4 (file version 7) database')
    }
    return parsed
  }

  if (parsed.pageType === 4) {
    for (let i = 0; i < parsed.itemCount; i++) {
      const index = reader.readUInt16()
      const extendPageID = reader.readUInt32()
      const length = reader.readUInt16()
      parsed.blocks.push({
        index,
        extendPageID,
        data: reader.readBytes(length)
      })
    }
  }

  if (parsed.pageType === 5) {
    parsed.extendData = reader.readBytes(parsed.itemCount)
  }

  return parsed
}

function readExtendData(file: Buffer, startPageID: number): Buffer {
  const chunks: Buffer[] = []
  let pageID = startPageID

  while (pageID !== UINT32_MAX) {
    const page = parsePage(file, pageID)
    if (!page || page.pageType !== 5) break
    chunks.push(page.extendData)
    pageID = page.nextPageID
  }

  return Buffer.concat(chunks)
}

export function readLiteDbDocuments(file: Buffer): BsonDocument[] {
  parsePage(file, 0)

  const pageCount = Math.floor(file.length / PAGE_SIZE)
  const documents: BsonDocument[] = []

  for (let pageID = 1; pageID < pageCount; pageID++) {
    const page = parsePage(file, pageID)
    if (!page || page.pageType !== 4) continue

    for (const block of page.blocks) {
      const data =
        block.extendPageID === UINT32_MAX
          ? block.data
          : readExtendData(file, block.extendPageID)

      if (!data.length) continue

      try {
        documents.push(deserializeBson(data))
      } catch {
        // Skip unreadable leftover blocks
      }
    }
  }

  return documents
}

export function asString(value: BsonValue | undefined): string | undefined {
  if (typeof value === 'string' && value.length) return value
  if (typeof value === 'number') return String(value)
  return undefined
}

export function asNumber(value: BsonValue | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

export function asBoolean(value: BsonValue | undefined): boolean {
  return value === true
}

export function asDoc(value: BsonValue | undefined): BsonDocument | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value
  }
  return undefined
}

export function asArray(value: BsonValue | undefined): BsonValue[] {
  return Array.isArray(value) ? value : []
}

export function asGuid(value: BsonValue | undefined): string | undefined {
  const text = asString(value)
  if (!text) return undefined
  return text.toLowerCase()
}
