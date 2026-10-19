export interface RecoverableEvent {
  type: string
  seq: number
  data?: unknown
}

/** The last turn/start that has no matching turn/end, if any. */
export function findOpenTurn(
  events: readonly RecoverableEvent[],
): { turn: number; startSeq: number } | null {
  const open = new Map<number, number>()
  for (const event of events) {
    const data = event.data
    const turn =
      data !== null && typeof data === 'object'
        ? Number((data as Record<string, unknown>).turn)
        : Number.NaN
    if (!Number.isInteger(turn)) continue
    if (event.type === 'turn/start') open.set(turn, event.seq)
    else if (event.type === 'turn/end') open.delete(turn)
  }
  const last = [...open.entries()].sort((left, right) => right[1] - left[1])[0]
  return last === undefined ? null : { turn: last[0], startSeq: last[1] }
}
