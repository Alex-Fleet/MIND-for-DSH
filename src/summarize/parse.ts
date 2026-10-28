export interface TurnSummary {
  title: string
  conclusion: string
  topics: string[]
}

/**
 * Parse the capture subagent's JSON. Models occasionally wrap the object in a
 * fence or add a sentence, so extract the first balanced-looking object and
 * validate every field; anything malformed returns null and the job retries.
 *
 * The summary is an index only. Memory proposals are owned by the main agent
 * through the `mind_remember` tool, not by this background summarizer.
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

  return {
    title: title.slice(0, 80),
    conclusion: conclusion.slice(0, 400),
    topics,
  }
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value.trim() : fallback
}
