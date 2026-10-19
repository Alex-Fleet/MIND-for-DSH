export interface DurableEntry {
  layer: 'project' | 'user'
  title: string
  conclusion: string
}

export interface TurnSummary {
  title: string
  conclusion: string
  topics: string[]
  durable: DurableEntry[]
  worthRemembering: boolean
}

/**
 * Parse the capture subagent's JSON. Models occasionally wrap the object in a
 * fence or add a sentence, so extract the first balanced-looking object and
 * validate every field; anything malformed returns null and the job retries.
 */
export function parseSummary(raw: string): TurnSummary | null {
  const text = raw.trim()
  if (text === '') return null

  const unfenced = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  const start = unfenced.indexOf('{')
  const end = unfenced.lastIndexOf('}')
  if (start < 0 || end <= start) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(unfenced.slice(start, end + 1))
  } catch {
    return null
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null

  const record = parsed as Record<string, unknown>
  const title = stringOr(record.title, '')
  const conclusion = stringOr(record.conclusion, '')
  if (title === '' && conclusion === '') return null

  const topics = Array.isArray(record.topics)
    ? record.topics.filter((topic): topic is string => typeof topic === 'string').slice(0, 12)
    : []

  const durable: DurableEntry[] = []
  if (Array.isArray(record.durable)) {
    for (const item of record.durable) {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) continue
      const entry = item as Record<string, unknown>
      const layer = entry.layer === 'user' ? 'user' : entry.layer === 'project' ? 'project' : null
      if (layer === null) continue
      const durableTitle = stringOr(entry.title, '').slice(0, 80)
      const durableConclusion = stringOr(entry.conclusion, '').slice(0, 240)
      if (durableTitle === '' || durableConclusion === '') continue
      durable.push({ layer, title: durableTitle, conclusion: durableConclusion })
    }
  }

  return {
    title: title.slice(0, 80),
    conclusion: conclusion.slice(0, 400),
    topics,
    durable: durable.slice(0, 8),
    worthRemembering: record.worthRemembering !== false,
  }
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value.trim() : fallback
}
