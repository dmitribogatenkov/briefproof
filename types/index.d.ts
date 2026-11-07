export type Stage = { id: string; label: string }
export type Requirement = { id: string; quote: string; status: string; reason?: string }
export type Ticket = { id: string; title: string; reqs: string[]; review: boolean; status: string; changedAt?: number }
export type LogLine = { t: number; msg: string }
export type Question = { id: string; text: string; options: string[]; default: string }
/** Token usage per stage, summed over every model request made while that stage was current. */
export type StageCost = { requests: number; input: number; output: number; cacheRead: number; cacheWrite: number; models: string[] }
export type RunState = {
  /** The run's folder, relative to the project: .briefproof/runs/<id>, or .briefproof for a run from before 0.9. */
  dir?: string
  /** A fresh build, or a change request on a finished run. */
  kind?: 'build' | 'change'
  /** change: the finished run this one changes, and the request in the user's words. */
  base?: string
  request?: string
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
  /** When each stage began and ended, by the clock; the end chart shows minutes beside tokens. */
  timeline?: Record<string, { startedAt: number; endedAt?: number }>
  /** The token budget from the settings, whether the run crossed it, and whether the user chose to continue anyway. */
  budget?: { limit: number; reached?: boolean; waived?: boolean; override?: boolean }
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
      /** True from session start until the agent touches the ledger: an existing run is interrupted, offer Resume. */
      fresh: boolean
      /** ~/.briefproof/stats.json, loaded at session start: finished runs, for the estimate. */
      stats: { runs: { at: number; project: string; kind: string; tickets: number; tokens: Record<string, number>; minutes: Record<string, number> }[] } | null
    }
  }
}
