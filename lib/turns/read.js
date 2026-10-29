import fs from 'node:fs';
import path from 'node:path';
import { redactWithSegments } from '../security/redact.js';
/** Files at or below this size are read in one allocation. */
const SMALL_FILE_BYTES = 8 * 1024 * 1024;
/** Streaming read buffer for larger files. */
const READ_BUFFER_BYTES = 64 * 1024;
/**
 * Read one character chunk of a captured turn.
 *
 * The path is resolved against the turn's recorded root and is rejected when
 * it escapes that root. Small files take one read; larger files are decoded
 * in bounded chunks so a chunk request never holds the whole file in memory.
 */
export function readTurnChunk(store, mindRoot, turnId, offsetChars = 0, maxChars = 20_000, options = {}) {
    const row = store.getTurn(turnId);
    if (row === undefined)
        throw new Error(`turn not found: ${turnId}`);
    const relative = String(row.raw_rel_path ?? '');
    if (relative === '')
        throw new Error(`turn has no readable raw file: ${turnId}`);
    const rootRow = store.getRootAbsolute(String(row.root_id ?? 'default'));
    const root = rootRow === undefined ? mindRoot : rootRow;
    const target = path.resolve(root, relative);
    const rootPrefix = path.resolve(root) + path.sep;
    if (!target.startsWith(rootPrefix))
        throw new Error(`turn raw path escapes its root: ${turnId}`);
    const max = Math.min(100_000, Math.max(1, Math.floor(maxChars)));
    // `Number(null) === 0`; a NULL raw_chars must mean "unknown", not an empty
    // file, or every large legacy turn would read as zero bytes.
    const storedTotal = row.raw_chars === null || row.raw_chars === undefined
        ? Number.NaN
        : Number(row.raw_chars);
    const knownTotal = Number.isFinite(storedTotal) && storedTotal >= 0 ? storedTotal : undefined;
    let result;
    try {
        const stat = fs.statSync(target);
        if (stat.size <= SMALL_FILE_BYTES) {
            const full = fs.readFileSync(target, 'utf8');
            const start = Math.max(0, Math.min(full.length, Math.floor(offsetChars)));
            result = {
                chunk: options.redact === true
                    ? redactedSlice(full, start, start + max)
                    : full.slice(start, start + max),
                total: full.length,
            };
        }
        else {
            // A legacy row may have no raw_chars. Count once and cache it; passing
            // the window end as the total would silently truncate later reads.
            const total = knownTotal ?? countChars(target);
            if (options.redact === true) {
                // Read a window around the requested range so a credential that
                // crosses either boundary is still matched as a whole before slicing.
                const start = Math.max(0, Math.floor(offsetChars));
                const windowStart = Math.max(0, start - REDACT_OVERLAP);
                const window = readLarge(target, windowStart, max + 2 * REDACT_OVERLAP, total);
                const localStart = start - windowStart;
                const localEnd = Math.min(window.chunk.length, localStart + max);
                result = {
                    chunk: redactedSlice(window.chunk, localStart, localEnd),
                    total,
                };
            }
            else {
                result = readLarge(target, Math.max(0, Math.floor(offsetChars)), max, total);
            }
        }
    }
    catch {
        throw new Error(`turn raw file is unavailable: ${turnId}`);
    }
    if (knownTotal === undefined && result.total >= 0) {
        try {
            store.setRawChars(turnId, result.total);
        }
        catch {
            // The cache is an optimization; never fail a read for it.
        }
    }
    const offset = Math.max(0, Math.min(result.total, Math.floor(offsetChars)));
    // Advance by the requested original characters, not by the redacted length:
    // redaction markers are shorter/longer than the secret they replace.
    const next = Math.min(result.total, offset + max);
    return {
        turnId,
        chunk: result.chunk,
        offset,
        total: result.total,
        next: next < result.total ? next : null,
        rawPath: relative,
    };
}
/**
 * Overlap enough to cover ordinary tokens and large private keys across
 * boundaries. A single credential larger than roughly 4 MB could still cross
 * the window; that is far beyond normal key sizes.
 */
const REDACT_OVERLAP = 4 * 1024 * 1024;
function redactedSlice(input, start, end) {
    if (end <= start)
        return '';
    const { text, segments } = redactWithSegments(input);
    let redactedStart = Number.POSITIVE_INFINITY;
    let redactedEnd = -1;
    for (const segment of segments) {
        if (segment.originalEnd <= start || segment.originalStart >= end)
            continue;
        // A marker is atomic: include it whole even when the requested range only
        // touches part of the secret. Never infer this from length equality: a
        // marker can happen to be exactly as long as the secret it replaces.
        const left = segment.redacted
            ? segment.redactedStart
            : segment.redactedStart + Math.max(start, segment.originalStart) - segment.originalStart;
        const right = segment.redacted
            ? segment.redactedEnd
            : segment.redactedStart + Math.min(end, segment.originalEnd) - segment.originalStart;
        redactedStart = Math.min(redactedStart, left);
        redactedEnd = Math.max(redactedEnd, right);
    }
    if (redactedEnd < 0)
        return '';
    return text.slice(redactedStart, redactedEnd);
}
/** One checkpoint every ~256K characters keeps seek gaps bounded. */
const CHECKPOINT_CHARS = 256 * 1024;
const charIndexCache = new Map();
function statStamp(stat) {
    return `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}:${stat.ino}`;
}
/**
 * Last byte index that ends on a complete UTF-8 sequence. Bytes after it are
 * carried into the next read so decoding never starts mid-codepoint.
 */
function safeUtf8End(buffer) {
    if (buffer.length === 0)
        return 0;
    let index = buffer.length - 1;
    let continuation = 0;
    for (;;) {
        const byte = buffer[index];
        if (byte === undefined || (byte & 0xc0) !== 0x80 || continuation >= 3)
            break;
        index -= 1;
        continuation += 1;
    }
    if (index < 0)
        return 0;
    const lead = buffer[index] ?? 0;
    let need = 1;
    if ((lead & 0x80) === 0)
        need = 1;
    else if ((lead & 0xe0) === 0xc0)
        need = 2;
    else if ((lead & 0xf0) === 0xe0)
        need = 3;
    else if ((lead & 0xf8) === 0xf0)
        need = 4;
    const end = index + need;
    return end <= buffer.length ? end : index;
}
function buildCharIndex(target) {
    const stat = fs.statSync(target);
    const stamp = statStamp(stat);
    const cached = charIndexCache.get(target);
    if (cached !== undefined && cached.stamp === stamp)
        return cached;
    const fd = fs.openSync(target, 'r');
    const buffer = Buffer.allocUnsafe(READ_BUFFER_BYTES);
    const decoder = new TextDecoder('utf-8');
    const checkpoints = [{ char: 0, byte: 0 }];
    let chars = 0;
    let bytesRead = 0;
    let pending = Buffer.alloc(0);
    let lastCheckpoint = 0;
    try {
        for (;;) {
            const bytes = fs.readSync(fd, buffer, 0, buffer.length, null);
            if (bytes === 0)
                break;
            bytesRead += bytes;
            const piece = pending.length === 0
                ? buffer.subarray(0, bytes)
                : Buffer.concat([pending, buffer.subarray(0, bytes)]);
            const safeEnd = safeUtf8End(piece);
            const text = decoder.decode(piece.subarray(0, safeEnd), { stream: true });
            chars += text.length;
            pending = Buffer.from(piece.subarray(safeEnd));
            if (chars - lastCheckpoint >= CHECKPOINT_CHARS) {
                checkpoints.push({ char: chars, byte: bytesRead - pending.length });
                lastCheckpoint = chars;
            }
        }
        if (pending.length > 0)
            chars += decoder.decode(pending).length;
    }
    finally {
        fs.closeSync(fd);
    }
    const index = { stamp, checkpoints, total: chars };
    charIndexCache.set(target, index);
    while (charIndexCache.size > 10) {
        const oldest = charIndexCache.keys().next().value;
        if (oldest === undefined)
            break;
        charIndexCache.delete(oldest);
    }
    return index;
}
/** Count decoded characters without holding the whole file in memory. */
export function countChars(target) {
    return buildCharIndex(target).total;
}
/** Decode a UTF-8 file slice starting near a checkpoint, not from byte 0. */
function readLarge(target, offset, max, knownTotal) {
    const index = buildCharIndex(target);
    const total = knownTotal ?? index.total;
    if (offset >= total)
        return { chunk: '', total };
    let checkpoint = index.checkpoints[0] ?? { char: 0, byte: 0 };
    for (const candidate of index.checkpoints) {
        if (candidate.char > offset)
            break;
        checkpoint = candidate;
    }
    const fd = fs.openSync(target, 'r');
    const buffer = Buffer.allocUnsafe(READ_BUFFER_BYTES);
    const decoder = new TextDecoder('utf-8');
    let bytePosition = checkpoint.byte;
    let position = checkpoint.char;
    let chunk = '';
    const append = (text) => {
        if (chunk.length >= max)
            return;
        const start = Math.max(0, offset - position);
        if (start >= text.length)
            return;
        chunk += text.slice(start, start + (max - chunk.length));
    };
    try {
        for (;;) {
            const bytes = fs.readSync(fd, buffer, 0, buffer.length, bytePosition);
            if (bytes === 0)
                break;
            bytePosition += bytes;
            const text = decoder.decode(buffer.subarray(0, bytes), { stream: true });
            append(text);
            position += text.length;
            if (chunk.length >= max)
                break;
            if (position >= total)
                break;
        }
        if (position < total) {
            const tail = decoder.decode();
            append(tail);
            position += tail.length;
        }
    }
    finally {
        fs.closeSync(fd);
    }
    return { chunk, total };
}
