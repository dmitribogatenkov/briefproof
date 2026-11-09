export type Stage = { id: string; label: string }
export type Requirement = {
  id: string
  quote: string
  status: string
  reason?: string
  /** Where this behaviour lives: project files the acceptance checker named. The drift check watches them. */
  files?: string[]
  /** The checker's evidence in one line (command and what it saw). */
  note?: string
}
export type Ticket = { id: string; title: string; reqs: string[]; review: boolean; status: string; changedAt?: number }
export type LogLine = { t: number; msg: string }
export type Question = { id: string; text: string; options: string[]; default: string }
/** Token usage per stage, summed over every model request made while that stage was current. */
export type StageCost = { requests: number; input: number; output: number; cacheRead: number; cacheWrite: number; models: string[] }
/** One finished run, as ~/.briefproof/stats.json keeps it for the estimates. `dir` identifies the run, so finishing it again replaces its entry. */
export type RunStat = { at: number; dir?: string; project: string; kind: string; tickets: number; tokens: Record<string, number>; minutes: Record<string, number> }
export type Stats = { runs: RunStat[] }
/** A hash per evidence file, taken when the run finished or was last re-checked. */
export type Proof = { at: number; files: Record<string, string> }
export type RunState = {
  /** The run's folder, relative to the project: .briefproof/runs/<id>, or .briefproof for a run from before 0.9. */
  dir?: string
  /** A fresh build, a change request on a finished run, or an existing project adopted as a finished run. */
  kind?: 'build' | 'change' | 'adopt'
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
  /** The token budget: its limit, whether the run crossed it, whether the user chose to continue anyway, and override = set for this run (wins over the settings). reached and waived belong to the limit; a new limit clears them. */
  budget?: { limit: number; reached?: boolean; waived?: boolean; override?: boolean }
  /** The evidence files as they were at the last check; what the drift warning compares against. */
  proof?: Proof
  /** A re-check is under way on this finished run: requests run on the Acceptance model until snapshot clears it. */
  rechecking?: boolean
}
/** A requirement row the user opened in the pane, and what they chose for it. */
export type ReqAction = { id: string; kind: 'defer' | 'drop' | null }
/** Evidence files changed since the last check, and the requirements that depend on them. */
export type Drift = { changed: string[]; reqs: string[] }

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
      stats: Stats | null
      /** What changed under a finished run since its last check; null when nothing did or nothing is watched. */
      drift: Drift | null
    }
  }
}
