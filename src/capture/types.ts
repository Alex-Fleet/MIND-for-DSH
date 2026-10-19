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
  events: CapturedEvent[]
}
