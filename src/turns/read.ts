import fs from 'node:fs'
import path from 'node:path'
import type { Store } from '../db/store.js'

export interface TurnChunk {
  turnId: string
  chunk: string
  offset: number
  total: number
  next: number | null
  rawPath: string
}

/** Files at or below this size are read in one allocation. */
const SMALL_FILE_BYTES = 8 * 1024 * 1024
/** Streaming read buffer for larger files. */
const READ_BUFFER_BYTES = 64 * 1024

/**
 * Read one character chunk of a captured turn.
 *
 * The path is resolved against the turn's recorded root and is rejected when
 * it escapes that root. Small files take one read; larger files are decoded
 * in bounded chunks so a chunk request never holds the whole file in memory.
 */
export function readTurnChunk(
  store: Store,
  mindRoot: string,
  turnId: string,
  offsetChars = 0,
  maxChars = 20_000,
): TurnChunk {
  const row = store.getTurn(turnId)
  if (row === undefined) throw new Error(`turn not found: ${turnId}`)

  const relative = String(row.raw_rel_path ?? '')
  if (relative === '') throw new Error(`turn has no readable raw file: ${turnId}`)

  const rootRow = store.getRootAbsolute(String(row.root_id ?? 'default'))
  const root = rootRow === undefined ? mindRoot : rootRow
  const target = path.resolve(root, relative)
  const rootPrefix = path.resolve(root) + path.sep
  if (!target.startsWith(rootPrefix)) throw new Error(`turn raw path escapes its root: ${turnId}`)

  const max = Math.min(100_000, Math.max(1, Math.floor(maxChars)))
  const storedTotal = Number(row.raw_chars)
  const knownTotal = Number.isFinite(storedTotal) && storedTotal >= 0 ? storedTotal : undefined
  let result: { chunk: string; total: number }
  try {
    const stat = fs.statSync(target)
    if (stat.size <= SMALL_FILE_BYTES) {
      const full = fs.readFileSync(target, 'utf8')
      const start = Math.max(0, Math.min(full.length, Math.floor(offsetChars)))
      result = { chunk: full.slice(start, start + max), total: full.length }
    } else {
      result = readLarge(target, Math.max(0, Math.floor(offsetChars)), max, knownTotal)
    }
  } catch {
    throw new Error(`turn raw file is unavailable: ${turnId}`)
  }
  if (knownTotal === undefined && result.total >= 0) {
    try {
      store.setRawChars(turnId, result.total)
    } catch {
      // The cache is an optimization; never fail a read for it.
    }
  }

  const offset = Math.max(0, Math.min(result.total, Math.floor(offsetChars)))
  const next = offset + result.chunk.length
  return {
    turnId,
    chunk: result.chunk,
    offset,
    total: result.total,
    next: next < result.total ? next : null,
    rawPath: relative,
  }
}

/** Decode a UTF-8 file in bounded chunks, collecting one character slice. */
function readLarge(
  target: string,
  offset: number,
  max: number,
  knownTotal?: number,
): { chunk: string; total: number } {
  if (knownTotal !== undefined && offset >= knownTotal) {
    return { chunk: '', total: knownTotal }
  }
  const fd = fs.openSync(target, 'r')
  const buffer = Buffer.allocUnsafe(READ_BUFFER_BYTES)
  const decoder = new TextDecoder('utf-8')
  let position = 0
  let chunk = ''

  const append = (text: string): void => {
    if (chunk.length >= max) return
    const start = Math.max(0, offset - position)
    if (start >= text.length) return
    chunk += text.slice(start, start + (max - chunk.length))
  }

  try {
    for (;;) {
      const bytes = fs.readSync(fd, buffer, 0, buffer.length, null)
      if (bytes === 0) break
      const text = decoder.decode(buffer.subarray(0, bytes), { stream: true })
      append(text)
      position += text.length
      if (chunk.length >= max) break
      if (knownTotal !== undefined && position >= knownTotal) break
    }
    if (knownTotal === undefined || position < knownTotal) {
      const tail = decoder.decode()
      append(tail)
      position += tail.length
    }
  } finally {
    fs.closeSync(fd)
  }

  return { chunk, total: knownTotal ?? position }
}
