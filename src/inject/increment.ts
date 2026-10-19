import type { Store } from '../db/store.js'

/**
 * One-line "what just happened" increment for the current turn.
 *
 * This is intentionally tiny (<200 chars): it is appended to the accepted
 * user batch once per turn instead of forcing the whole snapshot to change.
 */
export function buildIncrement(store: Store, workspaceId: string, localDate: string): string | null {
  const rows = store.listTurnsForDay(workspaceId, localDate)
  if (rows.length === 0) return null
  const last = rows[rows.length - 1]
  if (last === undefined) return null

  const time = String(last.occurred_at ?? '').slice(11, 16)
  const title = String(last.title ?? '(未摘要)')
  const rawPath = String(last.raw_rel_path ?? '')
  return `[MIND] ${time} ${title}${rawPath === '' ? '' : ` · ${rawPath}`}`.slice(0, 200)
}
