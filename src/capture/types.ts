export interface CapturedEvent {
  type: string
  seq: number | null
  occurredAt: number
  data: unknown
}

export interface CapturedTurn {
  sessionId: string
  turn: number
  startedAt: number
  endedAt: number
  endReason: string | null
  origin: 'main' | 'subagent'
  workspacePath: string | null
  /** Provider/model used by the turn, when known at capture time. */
  provider?: string | null
  model?: string | null
  events: CapturedEvent[]
}
