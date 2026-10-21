export type Stage = { id: string; label: string }
export type Requirement = { id: string; quote: string; status: string; reason?: string }
export type Ticket = { id: string; title: string; reqs: string[]; review: boolean; status: string; changedAt?: number }
export type LogLine = { t: number; msg: string }
export type Question = { id: string; text: string; options: string[]; default: string }
/** Token usage per stage, summed over every model request made while that stage was current. */
export type StageCost = { requests: number; input: number; output: number; cacheRead: number; cacheWrite: number; models: string[] }
export type RunState = {
  project: string
  mode: string
  stage: string
  stages: Stage[]
  startedAt: number
  updatedAt: number
  requirements: Requirement[]
  tickets: Ticket[]
  gates: Record<string, string>
  log: LogLine[]
  /** The engine's question dialog, mirrored while it is open. */
  pending?: { questions: Question[]; askedAt: number }
  /** The user pressed Pause: no new ticket may start until they resume. */
  paused?: boolean
  /** Filled in by the mod as requests complete; also in the final report. */
  usage?: Record<string, StageCost>
}
/** A requirement row the user opened in the pane, and what they chose for it. */
export type ReqAction = { id: string; kind: 'defer' | 'drop' | null }

declare module 'claude-code' {
  interface PluginState {
    'briefproof': {
      run: RunState | null
      opened: boolean
      /** Animation tick for the terminal's text capybaras. */
      frame: number
      reqAction: ReqAction | null
      /** Live token usage per stage, mirrored into the ledger file on each write. */
      cost: Record<string, StageCost>
    }
  }
}
