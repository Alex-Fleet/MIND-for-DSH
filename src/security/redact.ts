/**
 * Redact credential-shaped strings from model-facing text.
 *
 * The vault keeps the original raw file locally (mode 0600); this function is
 * applied to summaries, proposals, snapshots, increments, and tool output so a
 * secret copied into a conversation cannot be echoed back to a model.
 */
const SECRET_WORD =
  '(?:api[_-]?key|apikey|secret|token|access[_-]?token|refresh[_-]?token|id[_-]?token|auth[_-]?token|password|passwd|passphrase|pass|pwd|access[_-]?key|client[_-]?secret|private[_-]?key|credential)'

// Key fragments are bounded to keep pathological lines from triggering
// quadratic backtracking (a 200 KB line of repeated "token" used to take
// seconds).
const QUOTED_KEY = `(["'])([^"'\\n]{0,64}${SECRET_WORD}[^"'\\n]{0,64})\\1\\s*[:=]\\s*`
const QUOTED_VALUE = `("(?:[^"\\\\]|\\\\.){1,}"|'(?:[^'\\\\]|\\\\.){1,}')`
const UNQUOTED_KEY = `([A-Za-z0-9_.-]{0,64}${SECRET_WORD}[A-Za-z0-9_.-]{0,64})`
const UNQUOTED_VALUE = `([^\\s,;]+)`

const PATTERNS: Array<{
  kind: string
  pattern: RegExp
  accept?: (match: RegExpExecArray) => boolean
}> = [
  {
    kind: 'PRIVATE_KEY',
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY(?: BLOCK)?-----/g,
  },
  {
    kind: 'BEARER',
    // Authorization context may carry a short token.
    pattern: /\bAuthorization\s*:\s*Bearer\s+[A-Za-z0-9._~+/-]{6,}=*/gi,
  },
  { kind: 'BEARER', pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*/gi },
  {
    kind: 'BASIC_AUTH',
    // Authorization context may carry a short user:password token.
    pattern: /\bAuthorization\s*:\s*Basic\s+[A-Za-z0-9+/_-]{4,}={0,4}(?![A-Za-z0-9+/=_-])/gi,
  },
  {
    kind: 'BASIC_AUTH',
    // Bare "Basic <word>" needs base64-ish evidence (mixed case + digit/pad),
    // otherwise ordinary prose such as "Basic configurationmanager" breaks.
    pattern:
      /\bBasic\s+(?=[A-Za-z0-9+/_-]*[A-Z])(?=[A-Za-z0-9+/_-]*[a-z])(?=[A-Za-z0-9+/_-]*[0-9=])[A-Za-z0-9+/_-]{12,}={0,4}(?![A-Za-z0-9+/=_-])/g,
  },
  { kind: 'JWT', pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g },
  { kind: 'API_KEY', pattern: /\bsk-(?:ant-)?[A-Za-z0-9_-]{16,}\b/g },
  { kind: 'GITHUB_TOKEN', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g },
  { kind: 'AWS_KEY', pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: 'GOOGLE_KEY', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { kind: 'SLACK_TOKEN', pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  {
    kind: 'SECRET_ASSIGNMENT',
    // JSON-style `"db_password": "value"`; the key may contain separators or
    // camelCase around the secret word. Quoted values are always redacted.
    pattern: new RegExp(`${QUOTED_KEY}${QUOTED_VALUE}`, 'gi'),
  },
  {
    kind: 'SECRET_ASSIGNMENT',
    // `password = "value"` and similar assignments with quoted values.
    pattern: new RegExp(`\\b${UNQUOTED_KEY}\\s*[:=]\\s*${QUOTED_VALUE}`, 'gi'),
  },
  {
    kind: 'SECRET_ASSIGNMENT',
    // Unquoted `db_password=value`. Reject code references such as
    // `getToken()` or `process.env.SECRET`.
    pattern: new RegExp(`\\b${UNQUOTED_KEY}\\s*[:=]\\s*${UNQUOTED_VALUE}`, 'gi'),
    accept: match => looksSecret(match[2] ?? ''),
  },
  {
    kind: 'ENV_SECRET',
    pattern:
      /\b(?:[A-Z][A-Z0-9_]*_)?(?:KEY|TOKEN|SECRET|PASSWORD|PASS|CREDENTIAL)\b\s*=\s*("(?:[^"\\]|\\.)*"|'[^']*'|[^\s,;]+)/g,
    accept: match => looksSecret(match[1] ?? ''),
  },
  { kind: 'URL_CREDENTIALS', pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/gi },
  { kind: 'CN_SECRET', pattern: /(密码|密钥|令牌|口令)\s*[:：=]\s*\S{6,}/g },
]

export interface RedactionSegment {
  originalStart: number
  originalEnd: number
  redactedStart: number
  redactedEnd: number
  /** True when the segment is a replacement marker, not copied text. */
  redacted: boolean
}

export interface RedactedText {
  text: string
  segments: RedactionSegment[]
}

function looksSecret(value: string): boolean {
  const raw = value.trim()
  if (raw === '') return false
  // A quoted value in an assignment is already strong evidence.
  if (/^["']/.test(raw)) return true
  if (raw.length < 4) return false
  if (/[(){}[\]`]/.test(raw)) return false
  if (/^(?:\$|process\.env|os\.environ|crypto\.|config\.|this\.|req\.|await\b)/i.test(raw)) {
    return false
  }
  if (/^(?:get|read|fetch|load|use|is|has|find)[A-Z_]/.test(raw)) return false
  if (/^(?:null|undefined|true|false)$/i.test(raw)) return false
  return true
}

/**
 * Redact and retain a mapping between original and redacted character
 * offsets. Chunked readers use the mapping to keep a credential that crosses
 * a chunk boundary inside one redaction marker.
 */
export function redactWithSegments(input: string): RedactedText {
  const ranges: Array<{ start: number; end: number; kind: string }> = []
  for (const { kind, pattern, accept } of PATTERNS) {
    pattern.lastIndex = 0
    for (;;) {
      const match = pattern.exec(input)
      if (match === null) break
      if (match[0].length === 0) {
        pattern.lastIndex += 1
        continue
      }
      if (accept !== undefined && !accept(match)) continue
      ranges.push({ start: match.index, end: match.index + match[0].length, kind })
    }
    pattern.lastIndex = 0
  }
  ranges.sort((left, right) => left.start - right.start || right.end - left.end)

  const merged: Array<{ start: number; end: number; kind: string }> = []
  for (const range of ranges) {
    const previous = merged[merged.length - 1]
    if (previous !== undefined && range.start < previous.end) {
      previous.end = Math.max(previous.end, range.end)
    } else {
      merged.push({ ...range })
    }
  }

  const segments: RedactionSegment[] = []
  let text = ''
  let cursor = 0
  const appendPlain = (start: number, end: number): void => {
    if (end <= start) return
    const chunk = input.slice(start, end)
    segments.push({
      originalStart: start,
      originalEnd: end,
      redactedStart: text.length,
      redactedEnd: text.length + chunk.length,
      redacted: false,
    })
    text += chunk
  }
  for (const range of merged) {
    appendPlain(cursor, range.start)
    const marker = `[REDACTED:${range.kind}]`
    segments.push({
      originalStart: range.start,
      originalEnd: range.end,
      redactedStart: text.length,
      redactedEnd: text.length + marker.length,
      redacted: true,
    })
    text += marker
    cursor = range.end
  }
  appendPlain(cursor, input.length)
  return { text, segments }
}

export function redactSecrets(text: string): string {
  return redactWithSegments(text).text
}
