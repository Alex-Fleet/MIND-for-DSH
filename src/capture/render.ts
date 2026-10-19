import type { CapturedEvent, CapturedTurn } from './types.js'

/** Events that carry conversation content worth rendering into the readable turn file. */
const CONTENT_EVENTS = new Set([
  'user/message',
  'developer/message',
  'assistant/message',
  'tool/call',
  'tool/result',
  'attachment',
])

/**
 * Render one turn as a multi-line Markdown file.
 *
 * Every line is hard-wrapped so DSH's read tool (2000 chars/line) never
 * truncates the middle of a long tool result.
 */
export function renderTurnMarkdown(turn: CapturedTurn, wrapWidth: number): string {
  const out: string[] = []
  out.push(`# Turn ${turn.sessionId} / #${turn.turn}`)
  out.push('')
  out.push(`- 开始: ${new Date(turn.startedAt).toISOString()}`)
  out.push(`- 结束: ${new Date(turn.endedAt).toISOString()}`)
  out.push(`- 结束原因: ${turn.endReason ?? 'unknown'}`)
  out.push(`- 来源: ${turn.origin}`)
  out.push(`- 工作区: ${turn.workspacePath ?? '(unknown)'}`)
  out.push('')

  for (const event of turn.events) {
    if (!CONTENT_EVENTS.has(event.type)) continue
    renderEvent(out, event)
  }

  return hardWrap(out.join('\n'), wrapWidth)
}

function renderEvent(out: string[], event: CapturedEvent): void {
  const data = asRecord(event.data)

  switch (event.type) {
    case 'user/message': {
      const source = asRecord(data?.source)
      // Runtime-context snapshots are also user-role messages; only the real
      // user input belongs in the readable turn file.
      if (source?.kind !== 'user') return
      out.push('## 用户', '')
      out.push(extractText(data ?? event.data).trim() || '(空)', '')
      return
    }
    case 'developer/message': {
      out.push('## 开发者消息', '')
      out.push(extractText(asRecord(data?.message) ?? data ?? event.data).trim() || '(空)', '')
      return
    }
    case 'assistant/message': {
      const step = data?.step
      out.push(`## 助手${step === undefined ? '' : ` · step ${String(step)}`}`, '')
      out.push(extractText(asRecord(data?.message) ?? data ?? event.data).trim() || '(空)', '')
      return
    }
    case 'tool/call': {
      const name = typeof data?.name === 'string' ? data.name : 'tool'
      out.push(`### 工具调用 · ${name}`, '')
      out.push('```json')
      out.push(stringify(data?.arguments ?? data ?? event.data))
      out.push('```', '')
      return
    }
    case 'tool/result': {
      out.push('### 工具结果', '')
      out.push(extractText(asRecord(data?.message) ?? data ?? event.data).trim() || '(空)', '')
      return
    }
    case 'attachment': {
      out.push('### 附件', '')
      out.push(stringify(data ?? event.data), '')
      return
    }
    default:
      return
  }
}

/** Concatenate the text-bearing blocks of a message or content array. */
export function extractText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(extractText).filter(Boolean).join('\n')
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (typeof record.text === 'string') return record.text
    if (record.content !== undefined) return extractText(record.content)
    if (record.message !== undefined) return extractText(record.message)
    return stringify(value)
  }
  return String(value)
}

/** Split every physical line into chunks no longer than `width` characters. */
export function hardWrap(text: string, width: number): string {
  if (!Number.isFinite(width) || width <= 0) return text
  const lines: string[] = []
  for (const line of text.split('\n')) {
    if (line.length <= width) {
      lines.push(line)
      continue
    }
    for (let offset = 0; offset < line.length; offset += width) {
      lines.push(line.slice(offset, offset + width))
    }
  }
  return lines.join('\n')
}

export function turnMachineLine(turn: CapturedTurn): string {
  return JSON.stringify({
    sessionId: turn.sessionId,
    turn: turn.turn,
    startedAt: new Date(turn.startedAt).toISOString(),
    endedAt: new Date(turn.endedAt).toISOString(),
    endReason: turn.endReason,
    origin: turn.origin,
    workspacePath: turn.workspacePath,
    eventCount: turn.events.length,
    eventTypes: turn.events.map(event => event.type),
  })
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function stringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
