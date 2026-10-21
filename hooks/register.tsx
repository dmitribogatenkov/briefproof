import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { PluginOptions } from 'claude-code'
import type { Question, ReqAction, Requirement, RunState, StageCost, Ticket } from '../types'

// One mod, so users need nothing but Claude Code:
//  1. the `state` tool: the only writer of .briefproof/state.json, with gates it enforces
//  2. the live pane: capybaras at work, questions to answer, requirements to steer, pause
//  3. a band above the prompt and notifications when the run is waiting for you
const TOOL = 'mcp__briefproof__state'
const PANE = 'briefproof'
const FILE = '.briefproof/state.json'
const BRIEF = '.briefproof/brief.md'
const POLL_MS = 2000
const TICK_MS = 220
const NBSP = ' '

const run = atom({ plugin: 'briefproof', key: 'run' } as const, null)
const opened = atom({ plugin: 'briefproof', key: 'opened' } as const, false)
const frame = atom({ plugin: 'briefproof', key: 'frame' } as const, 0)
const reqAction = atom({ plugin: 'briefproof', key: 'reqAction' } as const, null)
const cost = atom({ plugin: 'briefproof', key: 'cost' } as const, {})

const STAGES = ['preflight', 'manifest', 'briefing', 'spec', 'plan', 'build', 'accept', 'done'] as const
const LABELS: Record<string, string> = {
  preflight: 'Preflight', manifest: 'Manifest', briefing: 'Briefing', spec: 'Spec',
  plan: 'Plan', build: 'Build', accept: 'Acceptance', done: 'Done',
}
const REQ_STATUS = ['open', 'in-spec', 'done', 'deferred', 'dropped']
const TICKET_STATUS = ['todo', 'running', 'review', 'done', 'failed']
const GATES = ['G1', 'G2', 'G3', 'G4']
const GATE_RESULTS = ['pass', 'fail', 'pending']
const ACTIONS = [
  'init', 'stage', 'mode', 'add_requirements', 'set_requirement', 'add_tickets',
  'set_ticket', 'gate', 'log', 'check', 'show',
]

const DESCRIPTION = [
  'The Briefproof run ledger: the ONLY way to create or change .briefproof/state.json',
  '(never edit that file by hand). Drives the live progress pane the user watches.',
  'Actions: init {project, mode?} · stage {stage} · mode {mode} ·',
  'add_requirements {quotes: verbatim strings} → R01… · set_requirement {id, status, reason?} ·',
  'add_tickets {tickets: [{title, reqs, review?}]} → T01… · set_ticket {id, status} ·',
  'gate {gate: G1-G4, result: pass|fail|pending, note?} · log {message} ·',
  'check (gate problems) · show (plain-text summary, use it to resume).',
].join(' ')

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ACTIONS },
    project: { type: 'string' },
    mode: { type: 'string', enum: ['ask', 'auto'] },
    stage: { type: 'string', enum: [...STAGES] },
    quotes: { type: 'array', items: { type: 'string' } },
    id: { type: 'string', description: 'R## or T##' },
    status: { type: 'string', description: `requirement: ${REQ_STATUS.join('|')}; ticket: ${TICKET_STATUS.join('|')}` },
    reason: { type: 'string', description: "for deferred/dropped: the user's own words" },
    tickets: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          reqs: { type: 'array', items: { type: 'string' } },
          review: { type: 'boolean' },
        },
        required: ['title', 'reqs'],
      },
    },
    gate: { type: 'string', enum: GATES },
    result: { type: 'string', enum: GATE_RESULTS },
    note: { type: 'string' },
    message: { type: 'string' },
  },
  required: ['action'],
}

type Event =
  | { kind: 'asked'; count: number }
  | { kind: 'ticket'; id: string; title: string; status: string }
  | { kind: 'done'; delivered: number; total: number }
type Outcome = { next: RunState | null; reply: string; events: Event[] }

class Refusal extends Error {}
const refuse = (msg: string): never => { throw new Refusal(msg) }
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const pad = (n: number) => String(n).padStart(2, '0')
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter((x): x is string => !!x) : [])

function addLog(s: RunState, msg: string) {
  s.log = [...s.log, { t: Date.now(), msg }].slice(-200)
}

function find<T extends { id: string }>(items: T[], id: unknown): T {
  const want = str(id)?.toUpperCase() ?? refuse('id is required')
  return items.find(x => x.id === want) ?? refuse(`unknown id ${want}`)
}

export function problems(s: RunState): string[] {
  const out: string[] = []
  const ids = new Set(s.requirements.map(r => r.id))
  for (const r of s.requirements) {
    if (r.status === 'open' && !r.reason) out.push(`G1 ${r.id} still open with no reason`)
    if (r.status === 'dropped' && !r.reason) out.push(`G1 ${r.id} dropped without the user's quote`)
  }
  const covered = new Set(s.tickets.flatMap(t => t.reqs))
  if (s.tickets.length > 0) {
    for (const r of s.requirements) {
      if ((r.status === 'in-spec' || r.status === 'done') && !covered.has(r.id)) {
        out.push(`G3 ${r.id} is in the spec but in no ticket`)
      }
    }
  }
  for (const t of s.tickets) {
    if (t.reqs.length === 0) out.push(`G3 ${t.id} traces to no requirement`)
    for (const id of t.reqs) if (!ids.has(id)) out.push(`G3 ${t.id} names unknown ${id}`)
  }
  return out
}

export function summary(s: RunState): string {
  const done = s.tickets.filter(t => t.status === 'done').length
  const lines = [
    `${s.project} · ${LABELS[s.stage] ?? s.stage} · mode ${s.mode}${s.paused ? ' · PAUSED by the user' : ''}`,
    `gates: ${GATES.map(g => `${g} ${s.gates[g] ?? 'pending'}`).join('  ')}`,
    `tickets ${done}/${s.tickets.length}`,
    ...s.tickets.map(t => `  ${t.id} [${t.status}] ${t.title} (${t.reqs.join(', ')})`),
    'requirements:',
    ...s.requirements.map(r => `  ${r.id} [${r.status}] ${r.quote}${r.reason ? ` (user: "${r.reason}")` : ''}`),
  ]
  if (s.pending) lines.push(`a question dialog is open: ${s.pending.questions.length} question(s)`)
  if (s.usage) {
    lines.push('usage by stage:')
    let total = 0
    for (const [stage, c] of Object.entries(s.usage)) {
      total += tokensOf(c)
      lines.push(`  ${LABELS[stage] ?? stage}: ${fmtTokens(tokensOf(c))} tokens · ${c.requests} requests · ${c.models.join(', ') || 'session model'}`)
    }
    lines.push(`  total: ${fmtTokens(total)} tokens`)
  }
  return lines.join('\n')
}

export function newRun(project: string, mode: string): RunState {
  const now = Date.now()
  const s: RunState = {
    project, mode, stage: 'preflight',
    stages: STAGES.map(id => ({ id, label: LABELS[id] ?? id })),
    startedAt: now, updatedAt: now,
    requirements: [], tickets: [],
    gates: Object.fromEntries(GATES.map(g => [g, 'pending'])),
    log: [],
  }
  addLog(s, `Run started · ${mode} mode`)
  return s
}

/** Applies one ledger action: the new state (null for read-only actions), the reply, and what to announce. */
export function apply(prev: RunState | null, e: Record<string, unknown>): Outcome {
  const action = str(e.action) ?? refuse('action is required')
  if (!ACTIONS.includes(action)) refuse(`unknown action ${action}; one of ${ACTIONS.join(', ')}`)
  const events: Event[] = []

  if (action === 'init') {
    if (prev) refuse(`a run already exists here (${prev.project}, stage ${prev.stage}). Use show to resume it.`)
    const mode = str(e.mode) ?? 'ask'
    if (mode !== 'ask' && mode !== 'auto') refuse('mode is ask or auto')
    const s = newRun(str(e.project) ?? refuse('init needs project'), mode)
    return { next: s, reply: `Run "${s.project}" started in ${mode} mode.`, events }
  }

  const cur = prev ?? refuse('no run in this folder yet; call init first')
  if (action === 'show') return { next: null, reply: summary(cur), events }
  if (action === 'check') {
    const p = problems(cur)
    return { next: null, reply: p.length ? p.join('\n') : 'ok, no gate problems', events }
  }

  const s: RunState = structuredClone(cur)
  let reply = 'ok'
  switch (action) {
    case 'stage': {
      const stage = str(e.stage) ?? refuse('stage is required')
      if (!(STAGES as readonly string[]).includes(stage)) refuse(`stage is one of ${STAGES.join(', ')}`)
      s.stage = stage
      addLog(s, `Stage → ${LABELS[stage]}`)
      reply = `Stage is now ${LABELS[stage]}.`
      if (stage === 'done') {
        const live = s.requirements.filter(r => r.status !== 'dropped' && r.status !== 'deferred')
        events.push({ kind: 'done', delivered: live.filter(r => r.status === 'done').length, total: live.length })
      }
      break
    }
    case 'mode': {
      const mode = str(e.mode)
      if (mode !== 'ask' && mode !== 'auto') refuse('mode is ask or auto')
      s.mode = mode as string
      addLog(s, `Mode → ${mode}`)
      break
    }
    case 'add_requirements': {
      const quotes = strings(e.quotes)
      if (quotes.length === 0) refuse('add_requirements needs quotes: a list of verbatim strings')
      const ids = quotes.map(quote => {
        const r: Requirement = { id: `R${pad(s.requirements.length + 1)}`, quote, status: 'open' }
        s.requirements.push(r)
        return r.id
      })
      addLog(s, `${ids.length} requirement${ids.length > 1 ? 's' : ''} recorded`)
      reply = `Added ${ids.join(', ')}.`
      break
    }
    case 'set_requirement': {
      const r = find(s.requirements, e.id)
      const status = str(e.status) ?? refuse('status is required')
      if (!REQ_STATUS.includes(status)) refuse(`requirement status is one of ${REQ_STATUS.join(', ')}`)
      const reason = str(e.reason)
      if ((status === 'dropped' || status === 'deferred') && !reason && !r.reason) {
        refuse(`${status} needs reason: the user's own words agreeing to it`)
      }
      r.status = status
      if (reason) r.reason = reason
      if (status === 'deferred' || status === 'dropped') addLog(s, `${r.id} ${status}`)
      reply = `${r.id} is ${status}.`
      break
    }
    case 'add_tickets': {
      const list = Array.isArray(e.tickets) ? e.tickets : []
      if (list.length === 0) refuse('add_tickets needs tickets: [{title, reqs, review?}]')
      const ids = list.map(raw => {
        const x = (raw ?? {}) as Record<string, unknown>
        const t: Ticket = {
          id: `T${pad(s.tickets.length + 1)}`,
          title: str(x.title) ?? refuse('every ticket needs a title'),
          reqs: strings(x.reqs).map(q => q.toUpperCase()),
          review: x.review === true,
          status: 'todo',
        }
        s.tickets.push(t)
        return t.id
      })
      addLog(s, `Plan: ${s.tickets.length} tickets`)
      reply = `Added ${ids.join(', ')}.`
      const p = problems(s).filter(x => x.startsWith('G3'))
      if (p.length) reply += `\nTrace problems:\n${p.join('\n')}`
      break
    }
    case 'set_ticket': {
      const t = find(s.tickets, e.id)
      const status = str(e.status) ?? refuse('status is required')
      if (!TICKET_STATUS.includes(status)) refuse(`ticket status is one of ${TICKET_STATUS.join(', ')}`)
      if (status === 'running' && t.status !== 'running' && s.paused) {
        refuse('Paused by the user. Do not start new tickets: finish what is already running, then end your turn and wait until they resume.')
      }
      t.status = status
      t.changedAt = Date.now()
      if (status === 'running') addLog(s, `${t.id} started · ${t.title}`)
      if (status === 'done' || status === 'failed') {
        addLog(s, `${t.id} ${status} · ${t.title}`)
        events.push({ kind: 'ticket', id: t.id, title: t.title, status })
      }
      const done = s.tickets.filter(x => x.status === 'done').length
      reply = `${t.id} is ${status}. ${done}/${s.tickets.length} done.`
      break
    }
    case 'gate': {
      const gate = str(e.gate)?.toUpperCase() ?? refuse('gate is required')
      if (!GATES.includes(gate)) refuse('gate is G1, G2, G3 or G4')
      const result = str(e.result) ?? refuse('result is required')
      if (!GATE_RESULTS.includes(result)) refuse('result is pass, fail or pending')
      if (result === 'pass') {
        const p = problems(s).filter(x => x.startsWith(gate))
        if (p.length) refuse(`${gate} cannot pass yet:\n${p.join('\n')}`)
      }
      s.gates[gate] = result
      const note = str(e.note)
      addLog(s, `Gate ${gate} ${result}${note ? `: ${note}` : ''}`)
      reply = `${gate} ${result}.`
      break
    }
    case 'log': {
      addLog(s, str(e.message) ?? refuse('log needs message'))
      break
    }
  }
  if (s.paused) {
    reply += '\n(The user paused the run: finish the ticket in progress, then stop and wait for them to resume.)'
  }
  s.updatedAt = Date.now()
  return { next: s, reply, events }
}

// ── Models per stage, and what each stage costs ───────────────────────────────

const MODEL_CHOICES = ['session', 'fable', 'opus', 'sonnet', 'haiku']
let modelOptions: PluginOptions = {}

/** The model the settings name for a stage; undefined = leave the session's model alone. */
export function modelFor(stage: string, options: PluginOptions = modelOptions): string | undefined {
  const v = options[stage]
  return typeof v === 'string' && MODEL_CHOICES.includes(v) && v !== 'session' ? v : undefined
}

const MODEL_LABEL: Record<string, string> = { fable: 'Fable', opus: 'Opus', sonnet: 'Sonnet', haiku: 'Haiku' }

export function addUsage(all: Record<string, StageCost>, stage: string, u: { model?: string; input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }): Record<string, StageCost> {
  const prev = all[stage] ?? { requests: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, models: [] }
  const models = u.model && !prev.models.includes(u.model) ? [...prev.models, u.model] : prev.models
  return {
    ...all,
    [stage]: {
      requests: prev.requests + 1,
      input: prev.input + (u.input_tokens || 0),
      output: prev.output + (u.output_tokens || 0),
      cacheRead: prev.cacheRead + (u.cache_read_input_tokens || 0),
      cacheWrite: prev.cacheWrite + (u.cache_creation_input_tokens || 0),
      models,
    },
  }
}

/** 'claude-sonnet-5-5' → 'Sonnet'; several models → joined. */
export function shortModel(models: string[]): string {
  const names = models.map(m => {
    const hit = /opus|sonnet|haiku|fable|mythos/i.exec(m)
    return hit ? hit[0][0]!.toUpperCase() + hit[0].slice(1).toLowerCase() : m
  })
  return [...new Set(names)].join('+')
}

export function tokensOf(c: StageCost): number {
  return c.input + c.output + c.cacheRead + c.cacheWrite
}

export function fmtTokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(2)}M`
}

// ── Effects shared by the tool and the pane's buttons ────────────────────────

// Writes may arrive together (parallel tool calls, a click during a call):
// each read-modify-write waits for the one before.
let queue: Promise<unknown> = Promise.resolve()
let lastStamp = -1

function statusLine(s: RunState): string {
  const stage = LABELS[s.stage] ?? s.stage
  const done = s.tickets.filter(t => t.status === 'done').length
  const base = s.tickets.length > 0 ? `briefproof · ${stage} · ${done}/${s.tickets.length} tickets` : `briefproof · ${stage}`
  if (s.pending) return `${base} · waiting for you`
  if (s.paused) return `${base} · paused`
  return base
}

/** Pushes a state to the pane and status line; opens the pane the first time a run appears. */
async function publish($: EngineInterface, s: RunState | null) {
  await update($, run, () => s)
  $.ui.status(s ? statusLine(s) : undefined)
  if (s && !(await read($, opened))) {
    await update($, opened, () => true)
    await $.ui.open({ id: PANE, title: `Briefproof · ${s.project}` })
  }
}

async function announce($: EngineInterface, events: Event[]) {
  for (const ev of events) {
    if (ev.kind === 'asked') {
      const text = `Briefproof has ${ev.count} question${ev.count > 1 ? 's' : ''} for you`
      $.ui.toast(`${text}: answer them in the dialog`)
      await $.ui.notify(text, { title: 'Briefproof' }).catch(() => undefined)
    } else if (ev.kind === 'ticket') {
      $.ui.toast(ev.status === 'done' ? `✓ ${ev.id} ${ev.title}` : `✗ ${ev.id} failed · ${ev.title}`)
    } else {
      const text = `Finished: ${ev.delivered}/${ev.total} requirements delivered`
      $.ui.toast(`♨ ${text}`)
      await $.ui.notify(text, { title: 'Briefproof' }).catch(() => undefined)
    }
  }
}

async function loadFile($: EngineInterface): Promise<RunState | null> {
  if (!(await $.fs.exists(FILE))) return null
  try {
    return JSON.parse(await $.fs.read(FILE)) as RunState
  } catch {
    return refuse(`${FILE} is unreadable; restore it from git rather than editing by hand`)
  }
}

/** The one write path: the ledger file. */
async function mutate($: EngineInterface, fn: (prev: RunState | null) => Outcome): Promise<string> {
  const job = queue.then(async () => {
    const prev = await loadFile($)
    const out = fn(prev)
    if (out.next) {
      const usage = await read($, cost)
      if (Object.keys(usage).length > 0) out.next.usage = usage
      await $.fs.write(FILE, `${JSON.stringify(out.next, null, 2)}\n`)
      lastStamp = out.next.updatedAt
      await publish($, out.next)
      await announce($, out.events)
    }
    return out.reply
  })
  queue = job.catch(() => undefined)
  return job
}

/** A change the user made in the pane: applied to a copy, logged, stamped. */
function edit(fn: (s: RunState) => void): (prev: RunState | null) => Outcome {
  return prev => {
    if (!prev) return { next: null, reply: 'no run', events: [] }
    const s = structuredClone(prev)
    fn(s)
    s.updatedAt = Date.now()
    const events: Event[] = []
    if (s.pending && !prev.pending) events.push({ kind: 'asked', count: s.pending.questions.length })
    for (const t of s.tickets) {
      const was = prev.tickets.find(x => x.id === t.id)?.status
      if (was !== t.status && (t.status === 'done' || t.status === 'failed')) {
        events.push({ kind: 'ticket', id: t.id, title: t.title, status: t.status })
      }
    }
    if (s.stage === 'done' && prev.stage !== 'done') {
      const live = s.requirements.filter(r => r.status !== 'dropped' && r.status !== 'deferred')
      events.push({ kind: 'done', delivered: live.filter(r => r.status === 'done').length, total: live.length })
    }
    return { next: s, reply: 'ok', events }
  }
}

/** Tells the agent, as the user's own message. */
async function tellAgent($: EngineInterface, text: string) {
  await $.prompt.submit({ text, asUser: true })
}

/** Mirrors the engine's own question dialog into the pane while it is open. */
function mirrorQuestions(raw: unknown): Question[] {
  const list = Array.isArray(raw) ? raw : []
  return list.map((q, i) => {
    const x = (q ?? {}) as Record<string, unknown>
    const options = Array.isArray(x.options)
      ? x.options.map(o => str((o as Record<string, unknown>)?.label)).filter((v): v is string => !!v)
      : []
    return { id: `Q${i + 1}`, text: str(x.question) ?? `Question ${i + 1}`, options, default: options[0] ?? '' }
  })
}

async function decideRequirement($: EngineInterface, id: string, kind: 'defer' | 'drop', why: string) {
  const words = why.trim()
  if (!words) return
  const status = kind === 'drop' ? 'dropped' : 'deferred'
  let quote = ''
  await mutate($, edit(s => {
    const r = s.requirements.find(x => x.id === id)
    if (!r) return
    quote = r.quote
    r.status = status
    r.reason = words
    addLog(s, `You ${status} ${id}`)
  }))
  await update($, reqAction, () => ({ id: '*', kind: null }) as ReqAction)
  await tellAgent($, `I ${status} ${id} ("${quote}"). In my words: "${words}". Please update the spec and plan to match.`)
}

async function addRequirement($: EngineInterface, text: string) {
  const quote = text.trim()
  if (!quote) return
  let id = ''
  await mutate($, edit(s => {
    id = `R${pad(s.requirements.length + 1)}`
    s.requirements.push({ id, quote, status: 'open' })
    addLog(s, `You added ${id}`)
  }))
  const brief = (await $.fs.exists(BRIEF)) ? await $.fs.read(BRIEF) : ''
  const header = brief.includes('## Additions') ? '' : `${brief.endsWith('\n') || !brief ? '' : '\n'}\n## Additions\n`
  await $.fs.write(BRIEF, `${brief}${header}\n- ${quote}\n`)
  await tellAgent($, `New requirement ${id}: "${quote}". I added it to the brief under Additions; please fit it into the spec and plan.`)
}

async function setPaused($: EngineInterface, paused: boolean) {
  await mutate($, edit(s => {
    s.paused = paused
    addLog(s, paused ? 'You paused the run' : 'You resumed the run')
  }))
  $.ui.toast(paused ? 'Briefproof will pause after the ticket in progress' : 'Briefproof resumed')
  if (!paused) await tellAgent($, 'Resume the Briefproof run.')
}

// ── Capybaras ────────────────────────────────────────────────────────────────
// Terminal: block-character art moved by a timer tick.
// Desktop (and any surface with Svg): a vector capybara that animates by itself (SMIL).

const MINI = [
  '  ▄▄▄▄▄▖▗ ',
  ' ▟██████•▌',
  '  ▝▘ ▝▘   ',
]
const MINI_LEGS = ['  ▝▘ ▝▘   ', '  ▞▚ ▞▚   ', '  ▘▝ ▘▝   ']
const MINI_W = 10
const SIT = [
  '   ▄▄▄▄▄▄▖ ▗▖ ',
  ' ▟████████@█▖ ',
  ' ████████████▘',
  '▔▔▀▀▔▔▔▔▀▀▔▔▔▔',
]
const ONSEN = [
  '   ▄▄▄▄▄▄▖ ▗▖ ',
  ' ▟████████@█▖ ',
]

const FUR = '#B8824F'
const FUR_DARK = '#8C5B33'
const INK = '#2A1A10'
const MUTED = '#8F8F8F'
const PAPER = '#F5F1E8'
const PAPER_EDGE = '#B9B2A5'
/** The scene is a square beside the caption, never the full width. */
const SQ = 96
const SCENE_H = SQ

export type Pose = 'run' | 'sit' | 'nap' | 'soak'
/** What the capybara holds or wears; one per stage, so you can tell the stage from the picture. */
export type Prop = 'none' | 'paper' | 'pencil' | 'speech' | 'question' | 'glasses' | 'tickets' | 'lens'

/** One capybara, 150 wide, feet on y=80, facing right; `pose` sets the posture and the SMIL animation. */
function capybara(pose: Pose, prop: Prop = 'none'): string {
  const closed = pose === 'nap' || pose === 'soak'
  const eye = closed
    ? `<path d="M116 32h9" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`
    : `<circle cx="120.5" cy="31.5" r="3" fill="${INK}"/>`
  const headAndBody = (bodyY: number, headY: number) => `
    <rect x="18" y="${bodyY}" width="106" height="44" rx="22" fill="${FUR}"/>
    <rect x="96" y="${headY}" width="54" height="42" rx="19" fill="${FUR}"/>
    <rect x="127" y="${headY + 15}" width="24" height="24" rx="10" fill="${FUR_DARK}"/>
    <circle cx="144" cy="${headY + 23}" r="2" fill="${INK}"/>
    <g transform="translate(0 ${headY - 16})">${eye}</g>
    <circle cx="104" cy="${headY + 3}" r="6.5" fill="${FUR_DARK}"/>
    <circle cx="104" cy="${headY + 3}" r="3" fill="#6B4425"/>`

  if (pose === 'run') {
    const d = 0.46
    const swing = 24
    const leg = (x: number, phase: number) =>
      `<rect x="${x}" y="60" width="11" height="20" rx="5" fill="${FUR_DARK}">
        <animateTransform attributeName="transform" type="rotate" values="-${swing} ${x + 5} 62;${swing} ${x + 5} 62;-${swing} ${x + 5} 62" dur="${d}s" begin="-${phase}s" repeatCount="indefinite"/>
      </rect>`
    const dust = `<g fill="${MUTED}"><circle cx="10" cy="76" r="3"><animate attributeName="opacity" values="0;.5;0" dur="${d}s" repeatCount="indefinite"/><animate attributeName="cx" values="14;0" dur="${d}s" repeatCount="indefinite"/></circle>
         <circle cx="4" cy="79" r="2"><animate attributeName="opacity" values="0;.4;0" dur="${d}s" begin="-${d / 2}s" repeatCount="indefinite"/><animate attributeName="cx" values="10;-6" dur="${d}s" begin="-${d / 2}s" repeatCount="indefinite"/></circle></g>`
    return `${dust}
      <g><animateTransform attributeName="transform" type="translate" values="0 0;0 -2.5;0 0" dur="${d}s" repeatCount="indefinite"/>
        ${leg(30, 0)}${leg(92, 0)}${leg(48, d / 2)}${leg(110, d / 2)}
        ${headAndBody(26, 16)}
      </g>`
  }

  if (pose === 'soak') {
    return `<g><animateTransform attributeName="transform" type="translate" values="0 0;0 1.5;0 0" dur="3s" repeatCount="indefinite"/>
      ${headAndBody(28, 12)}
    </g>`
  }

  // Sitting (head top at y=20, eye at 120,35.5, nose at 144,43) and napping.
  const zz = pose === 'nap'
    ? `<g font-family="ui-sans-serif, system-ui, sans-serif" font-weight="700" fill="${MUTED}">
         <text x="150" y="24" font-size="12">z<animate attributeName="opacity" values="0;1;0" dur="2.4s" repeatCount="indefinite"/><animate attributeName="y" values="28;14" dur="2.4s" repeatCount="indefinite"/></text>
         <text x="161" y="18" font-size="15">z<animate attributeName="opacity" values="0;1;0" dur="2.4s" begin="-1.2s" repeatCount="indefinite"/><animate attributeName="y" values="24;10" dur="2.4s" begin="-1.2s" repeatCount="indefinite"/></text>
       </g>`
    : ''
  const breathe = `<animateTransform attributeName="transform" type="scale" values="1 1;1 1.015;1 1" dur="3.2s" repeatCount="indefinite" additive="sum"/>`
  const body = `<g>${breathe}
      <ellipse cx="46" cy="78" rx="15" ry="5" fill="${FUR_DARK}"/>
      <ellipse cx="112" cy="78" rx="13" ry="5" fill="${FUR_DARK}"/>
      ${headAndBody(32, 20)}
    </g>`
  return `${zz}${propBehind(prop)}${body}${propInFront(prop)}`
}

const bubble = (text: string, size: number) => `<g>
    <rect x="136" y="1" width="30" height="22" rx="8" fill="${PAPER}" stroke="${PAPER_EDGE}"/>
    <path d="M142 22l-4 5 9-4z" fill="${PAPER}" stroke="${PAPER_EDGE}" stroke-linejoin="round"/>
    <text x="151" y="17" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-weight="700" font-size="${size}" fill="${INK}">${text}</text>
  </g>`

/** Props drawn behind the capybara (the sheet it reads, the tickets on the floor). */
function propBehind(prop: Prop): string {
  switch (prop) {
    case 'paper': // Preflight: reading the brief, the sheet nodding as it reads
      return `<g transform="rotate(-8 160 44)"><animateTransform attributeName="transform" type="rotate" values="-8 160 44;-5 160 44;-8 160 44" dur="2.6s" repeatCount="indefinite"/>
        <rect x="146" y="22" width="32" height="42" rx="2" fill="${PAPER}" stroke="${PAPER_EDGE}"/>
        <path d="M152 31h20M152 38h20M152 45h14M152 52h18" stroke="${PAPER_EDGE}" stroke-width="1.8" stroke-linecap="round"/></g>`
    case 'pencil': // Manifest: a sheet on the floor; the quotes appear line by line
      return `<rect x="150" y="62" width="38" height="18" rx="2" fill="${PAPER}" stroke="${PAPER_EDGE}"/>
        ${[67, 72, 77].map((y, i) => `<path d="M155 ${y}h${26 - i * 6}" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"><animate attributeName="opacity" values="0;0;1;1" keyTimes="0;${(0.2 + i * 0.25).toFixed(2)};${(0.3 + i * 0.25).toFixed(2)};1" dur="3.6s" repeatCount="indefinite"/></path>`).join('')}`
    case 'tickets': // Plan: a stack of tickets, the top one landing
      return `<g>
        <rect x="150" y="64" width="34" height="14" rx="2" fill="${PAPER}" stroke="${PAPER_EDGE}"/><rect x="150" y="64" width="6" height="14" rx="2" fill="#3FAE6A"/>
        <rect x="152" y="54" width="34" height="14" rx="2" fill="${PAPER}" stroke="${PAPER_EDGE}"/><rect x="152" y="54" width="6" height="14" rx="2" fill="#D97757"/>
        <g><animateTransform attributeName="transform" type="translate" values="0 -14;0 0;0 0" keyTimes="0;.3;1" dur="3s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.3;.9;1" dur="3s" repeatCount="indefinite"/>
          <rect x="154" y="44" width="34" height="14" rx="2" fill="${PAPER}" stroke="${PAPER_EDGE}"/><rect x="154" y="44" width="6" height="14" rx="2" fill="#4EA2C8"/></g>
      </g>`
    default:
      return ''
  }
}

/** Props drawn over the capybara (what it holds, wears or says). */
function propInFront(prop: Prop): string {
  switch (prop) {
    case 'question': return bubble('?', 15)
    case 'speech': // Briefing: working out what to ask
      return `<g>
        <rect x="136" y="1" width="30" height="22" rx="8" fill="${PAPER}" stroke="${PAPER_EDGE}"/>
        <path d="M142 22l-4 5 9-4z" fill="${PAPER}" stroke="${PAPER_EDGE}" stroke-linejoin="round"/>
        ${[144, 151, 158].map((x, i) => `<circle cx="${x}" cy="12" r="2" fill="${INK}"><animate attributeName="opacity" values=".25;1;.25" dur="1.2s" begin="-${(i * 0.3).toFixed(1)}s" repeatCount="indefinite"/></circle>`).join('')}
      </g>`
    case 'pencil': // Manifest: a pencil in the front paw, writing on the sheet below
      return `<g><animateTransform attributeName="transform" type="rotate" values="-5 112 70;4 112 70;-5 112 70" dur="0.8s" repeatCount="indefinite"/>
        <path d="M104 62L160 76" stroke="#E0A030" stroke-width="6" stroke-linecap="round"/>
        <path d="M102 61.5l5 1.3" stroke="#E08A8A" stroke-width="6" stroke-linecap="round"/>
        <path d="M158 75.5l7 1.8" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/></g>
        <ellipse cx="112" cy="70" rx="8" ry="5" fill="${FUR_DARK}"/>`
    case 'glasses': // Spec: reading glasses and a thought bubble
      return `<g fill="none" stroke="${INK}" stroke-width="1.8">
          <circle cx="120.5" cy="35.5" r="8" fill="#FFFFFF" fill-opacity=".12"/>
          <path d="M112.5 35.5h-11"/></g>
        <g fill="${PAPER}" stroke="${PAPER_EDGE}">
          <circle cx="139" cy="18" r="2.2"/><circle cx="146" cy="11" r="3.2"/>
          <ellipse cx="161" cy="0" rx="16" ry="10"/></g>
        <text x="161" y="4" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-weight="700" font-size="13" fill="${INK}">…<animate attributeName="opacity" values="1;.3;1" dur="2s" repeatCount="indefinite"/></text>`
    case 'lens': // Acceptance: the blind check, lens sweeping
      return `<g><animateTransform attributeName="transform" type="translate" values="0 0;-5 3;0 0" dur="2.8s" repeatCount="indefinite"/>
        <path d="M169 49l12 13" stroke="${MUTED}" stroke-width="4.5" stroke-linecap="round"/>
        <circle cx="159" cy="38" r="14" fill="#4EA2C8" fill-opacity=".25" stroke="${MUTED}" stroke-width="2.8"/>
        <path d="M151 32q4 -5 10 -4" stroke="#FFFFFF" stroke-opacity=".6" stroke-width="1.6" stroke-linecap="round" fill="none"/></g>`
    default:
      return ''
  }
}

const svgOpen = (w: number, h = SCENE_H) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">`

/** A sitting capybara with the stage's prop, in the square. The prop space is to the right, so the body sits left. */
export function sceneSvg(pose: 'sit' | 'nap', prop: Prop): string {
  const scale = 0.5
  const x = prop === 'none' || prop === 'question' || prop === 'speech' || prop === 'glasses' ? 6 : 1
  return `${svgOpen(SQ)}
    <g transform="translate(${x} ${(SQ - 14 - 80 * scale).toFixed(1)}) scale(${scale})">${capybara(pose, prop)}</g></svg>`
}

/** Build: every agent at work is a capybara running on the spot; more of them means smaller ones, stacked in the square. */
export function herdSvg(lanes: { slow: boolean }[]): string {
  const n = Math.min(3, Math.max(1, lanes.length))
  const scale = n === 1 ? 0.5 : n === 2 ? 0.36 : 0.29
  const bodyH = 80 * scale
  const rowH = (SQ - 8) / n
  const herd = Array.from({ length: n }, (_, i) => {
    const feetY = n === 1 ? SQ - 14 : 4 + rowH * (i + 1) - 1
    const x = n === 1 ? 10 : 14 + ((i % 2) * 18)
    return `<g transform="translate(${x} ${(feetY - bodyH).toFixed(1)}) scale(${scale})">${capybara('run')}</g>`
  }).join('')
  return `${svgOpen(SQ)}${herd}</svg>`
}

/** Done: the hot spring, in the square. */
export function onsenSvg(): string {
  const scale = 0.5
  const wave = (y: number, op: number, dur: number) =>
    `<path fill="#4EA2C8" fill-opacity="${op}" d="M-40 ${y}q10 -3 20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0V${SQ}H-40z">
       <animateTransform attributeName="transform" type="translate" values="0 0;-40 0" dur="${dur}s" repeatCount="indefinite"/></path>`
  const steam = (sx: number, delay: number) =>
    `<path d="M${sx} 40c-4 -5 4 -8 0 -14" fill="none" stroke="${MUTED}" stroke-width="1.6" stroke-linecap="round">
       <animate attributeName="opacity" values="0;.55;0" dur="3s" begin="-${delay}s" repeatCount="indefinite"/>
       <animateTransform attributeName="transform" type="translate" values="0 4;0 -8" dur="3s" begin="-${delay}s" repeatCount="indefinite"/></path>`
  const ty = SQ - 14 - 80 * scale // same baseline as the other scenes
  const top = ty + 50 * scale // water line through the body
  return `${svgOpen(SQ)}
    ${steam(30, 0)}${steam(48, 1)}${steam(66, 2)}
    <g transform="translate(6 ${ty.toFixed(1)}) scale(${scale})"><g><animateTransform attributeName="transform" type="translate" values="0 0;0 2;0 0" dur="3s" repeatCount="indefinite"/>${capybara('soak')}</g></g>
    ${wave(top, 0.45, 6)}
    ${wave(top + 3, 0.55, 4)}
    <g><animateTransform attributeName="transform" type="translate" values="78 ${(top + 14).toFixed(1)};78 ${(top + 16).toFixed(1)};78 ${(top + 14).toFixed(1)}" dur="2.6s" repeatCount="indefinite"/>
      <circle r="4" fill="#F2B233"/><ellipse cx="2.2" cy="-3.8" rx="2.5" ry="1.1" fill="#5BA35A" transform="rotate(-30 2.2 -3.8)"/>
    </g></svg>`
}

/** Which capybara stands for which stage. */
const STAGE_PROP: Record<string, Prop> = {
  preflight: 'paper', manifest: 'pencil', briefing: 'speech', spec: 'glasses', plan: 'tickets', accept: 'lens',
}

/** The caption beside the square: what it is doing, and a line with some character. Picked by the log length, so it changes as the run moves and never between redraws. */
const QUIPS: Record<string, string[]> = {
  preflight: ['Twice, slowly. Capybaras don’t skim.', 'Secrets get redacted before anything else happens.'],
  manifest: ['Quote by quote. Paraphrase is how requirements go missing.', 'R01, R02, R03… nothing gets a nickname.'],
  briefing: ['Only what the brief leaves open gets asked.', 'Each question comes with a suggested answer, so you can just nod.'],
  waiting: ['Won’t move until you answer. Capybaras are patient like that.', 'Your call. Claude Code’s own dialog has the questions.'],
  spec: ['Glasses on. Every line in the spec traces back to something you said.', 'Writing it down properly, so the builders don’t have to guess.'],
  plan: ['Small enough for one fresh agent each.', 'Boundaries first, so the first ticket doesn’t set the architecture.'],
  build: ['Each agent works in its own clean room: no shared memory, no shared mess.', 'The coordinator never codes. It just keeps the capybaras fed.'],
  between: ['Catching breath between tickets. The next one starts in a moment.', 'Reviewing what just landed before the next ticket goes out.'],
  accept: ['A stranger reads your brief, then the code. Never the other way round.', 'Blind check: a fresh agent, your original words, no memory of the build.'],
  done: ['Hot spring, a yuzu, nothing left on the list.', 'You earned the break. The capybara only did the typing.'],
  paused: ['Napping until you press Resume. No new tickets until then.', 'Holding still. The ticket in progress finishes, then nothing moves.'],
}
export function quip(key: string, seed: number): string {
  const list = QUIPS[key] ?? QUIPS.build!
  return list[seed % list.length]!
}

/** The eight stages as a segmented bar: done, current, ahead. */
export function stepperSvg(w: number, count: number, current: number, finished = false): string {
  const gap = 4
  const seg = (w - gap * (count - 1)) / count
  const bars = Array.from({ length: count }, (_, i) => {
    const fill = i < current || finished ? '#3FAE6A' : i === current ? '#D97757' : MUTED
    const op = i > current ? 0.35 : 1
    return `<rect x="${(i * (seg + gap)).toFixed(1)}" y="2" width="${seg.toFixed(1)}" height="5" rx="2.5" fill="${fill}" fill-opacity="${op}"/>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="10" viewBox="0 0 ${w} 10" role="img">${bars}</svg>`
}

/** Tokens per stage as horizontal bars: label, bar, share. Drawn once the run is done. */
export function costSvg(w: number, rows: { label: string; tokens: number; model: string }[]): string {
  const total = rows.reduce((n, r) => n + r.tokens, 0) || 1
  const rowH = 22
  const labelW = 86
  const valueW = 150
  const barW = Math.max(40, w - labelW - valueW)
  const font = 'font-family="ui-sans-serif, system-ui, sans-serif" font-size="12"'
  const bars = rows.map((r, i) => {
    const y = i * rowH
    const share = r.tokens / total
    const bw = Math.max(2, Math.round(barW * share))
    return `<text x="0" y="${y + 15}" ${font} fill="${MUTED}">${r.label}</text>
      <rect x="${labelW}" y="${y + 5}" width="${barW}" height="12" rx="6" fill="${MUTED}" fill-opacity=".18"/>
      <rect x="${labelW}" y="${y + 5}" width="${bw}" height="12" rx="6" fill="#D97757" fill-opacity="${0.55 + share * 0.45}"/>
      <text x="${labelW + barW + 10}" y="${y + 15}" ${font} fill="${MUTED}">${String(Math.round(share * 100)).padStart(2)}%  ${fmtTokens(r.tokens)}${r.model ? `  ${r.model}` : ''}</text>`
  }).join('')
  const h = rows.length * rowH
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">${bars}</svg>`
}

/** Finished tickets as one rounded track. */
export function progressSvg(w: number, done: number, total: number): string {
  const fillW = total > 0 ? Math.max(0, Math.round((w * done) / total)) : 0
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="10" viewBox="0 0 ${w} 10" role="img">
    <rect x="0" y="2" width="${w}" height="5" rx="2.5" fill="${MUTED}" fill-opacity=".3"/>
    ${fillW > 0 ? `<rect x="0" y="2" width="${fillW}" height="5" rx="2.5" fill="#3FAE6A"/>` : ''}</svg>`
}

export function isAnimating(s: RunState | null): boolean {
  if (!s) return false
  if (s.stage === 'done') return Date.now() - s.updatedAt < 120_000
  return s.tickets.some(t => t.status === 'running' || t.status === 'review') || !!s.pending
}

function clock(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}


const TICKET_MARK: Record<string, string> = { todo: '○', running: '◐', review: '◑', done: '●', failed: '✗' }
const TICKET_COLOR: Record<string, string> = { running: 'claude', review: 'warning', done: 'success', failed: 'error' }
const REQ_COLOR: Record<string, string> = {
  'in-spec': 'suggestion', done: 'success', deferred: 'warning', dropped: 'inactive', open: 'text',
}
const GATE_LABEL: Record<string, string> = {
  G1: 'requirements settled', G2: 'spec covers the brief', G3: 'plan traced', G4: 'blind acceptance',
}
const GATE_MARK: Record<string, string> = { pass: '✓', fail: '✗', pending: '·' }
const GATE_COLOR: Record<string, string> = { pass: 'success', fail: 'error', pending: 'inactive' }

export const register: Register = (on, options) => {
  modelOptions = options

  on('session.start', async ($, e, next) => {
    await $.tool.register({ name: 'state', description: DESCRIPTION, inputSchema: INPUT_SCHEMA, isDeferred: false })

    // Picks up a run that already exists (resume) or changed outside this session.
    $.clock.every(POLL_MS, () => {
      void (async () => {
        let s: RunState | null = null
        try {
          s = await loadFile($)
        } catch {
          return
        }
        const stamp = s?.updatedAt ?? 0
        if (stamp === lastStamp) return
        lastStamp = stamp
        await publish($, s)
      })()
    })

    // Moves the terminal's text capybaras while anyone is working. (The vector ones animate on their own.)
    if (e.surface === 'terminal') {
      $.clock.every(TICK_MS, () => {
        void (async () => {
          if (isAnimating(await read($, run))) await update($, frame, n => (n + 1) % 100_000)
        })()
      })
    }

    return next(e)
  })

  on('tool.call', { tool: TOOL }, async ($, call) => {
    try {
      return { result: await mutate($, prev => apply(prev, call as unknown as Record<string, unknown>)) }
    } catch (err) {
      if (err instanceof Refusal) return { deny: err.message }
      throw err
    }
  }).catch(() => ({ deny: 'The Briefproof ledger hit an internal error; nothing was written. Try the call again.' }))

  // The ledger only touches .briefproof/, so never ask the user to approve it.
  on('tool.check', { tool: TOOL }, () => ({ decision: 'allow' })).catch(($, e, next) => next(e))

  // Every model request of a run (the orchestrator's and the subagents') uses the
  // model the settings name for the current stage, and its usage is counted there.
  on('turn.step', async function* ($, e, next) {
    const s = await read($, run)
    if (!s) return yield* next(e)
    const stage = s.stage
    const model = modelFor(stage)
    const result = yield* next(model ? { ...e, model } : e)
    if (result.usage) {
      const u = result.usage
      await update($, cost, all => addUsage(all, stage, u))
    }
    return result
  })

  // While the engine's own question dialog is open, the pane shows the questions and the capybara waits.
  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    const questions = mirrorQuestions(e.questions)
    const s = await read($, run)
    const mirror = !!s && questions.length > 0
    if (mirror) {
      await mutate($, edit(x => {
        x.pending = { questions, askedAt: Date.now() }
        addLog(x, `Asked you ${questions.length} question${questions.length > 1 ? 's' : ''}`)
      }))
    }
    try {
      return await next(e)
    } finally {
      if (mirror) {
        await mutate($, edit(x => {
          delete x.pending
          addLog(x, 'Answers received')
        }))
      }
    }
  }).catch(($, e, next) => (next.called ? next(e) : next(e)))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const s = await read($, run)
    if (e.props.hasSurvey || !s?.paused) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    return (
      <Box>
        <Text color="warning" bold>Briefproof is paused </Text>
        <Button key="band-resume" label="Resume" onPress={() => setPaused($, false)} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const s = await read($, run)
    const isTerminal = e.surface === 'terminal'
    const tick = isTerminal ? await read($, frame) : 0

    if (!s) {
      return (
        <Box flexDirection="column">
          <Text bold>Briefproof</Text>
          <Text dimColor>No run in this folder yet.</Text>
          <Text dimColor>Start one with /briefproof:build &lt;what to build&gt;.</Text>
        </Box>
      )
    }

    const cols = Math.max(24, (e.props.bodyColumns ?? 48) - 1)
    const px = Math.min(480, Math.max(220, Math.round(cols * 7.4)))
    const lanes = s.tickets.filter(t => t.status === 'running' || t.status === 'review')
    const live = s.requirements.filter(r => r.status !== 'dropped' && r.status !== 'deferred')
    const delivered = live.filter(r => r.status === 'done').length

    // ── the scene: a square capybara for the stage, and a caption beside it ──
    const pad = (n: number) => NBSP.repeat(Math.max(0, n))
    const art = (row: string, x: number, color = 'claude') => {
      const [pre, post] = row.split('@')
      return (
        <Text color={color} wrap="truncate-end">
          {pad(x)}{(pre ?? '').replaceAll(' ', NBSP)}
          {post !== undefined && <Text color="text">•</Text>}
          {(post ?? '').replaceAll(' ', NBSP)}
        </Text>
      )
    }
    const seed = s.log.length
    const working = lanes.length > 0 && s.stage === 'build'
    const moment =
      s.stage === 'done' ? 'done'
      : s.pending ? 'waiting'
      : s.paused ? 'paused'
      : working ? 'build'
      : s.stage === 'build' ? 'between'
      : s.stage
    const title =
      moment === 'done' ? `All done · ${delivered}/${live.length} requirements delivered`
      : moment === 'waiting' ? 'Waiting for you'
      : moment === 'paused' ? 'Paused'
      : moment === 'build' ? `${lanes.length} at work`
      : moment === 'between' ? 'Between tickets'
      : ({ preflight: 'Reading the brief', manifest: 'Copying your words', briefing: 'Working out what to ask', spec: 'Writing the spec', plan: 'Cutting tickets', accept: 'Blind check in progress' } as Record<string, string>)[moment] ?? LABELS[s.stage] ?? s.stage
    const detail =
      moment === 'waiting' ? `${s.pending!.questions.length} question${s.pending!.questions.length > 1 ? 's' : ''} in the dialog`
      : moment === 'build' ? lanes.map(t => `${t.title}${t.status === 'review' ? ' (review)' : ''}`).join(' · ')
      : null
    const caption = (
      <Box flexDirection="column" flexGrow={1} flexShrink={1}>
        <Text bold color={moment === 'done' ? 'success' : moment === 'build' ? 'claude' : undefined} wrap="truncate-end">{title}</Text>
        {detail && <Text dimColor wrap="truncate-end">{detail}</Text>}
        <Text dimColor wrap="wrap">{quip(moment, seed)}</Text>
      </Box>
    )

    const Svg = isTerminal ? null : $.ui.resolve(e).Svg
    let picture
    if (!isTerminal && Svg) {
      const source =
        moment === 'done' ? onsenSvg()
        : moment === 'waiting' ? sceneSvg('sit', 'question')
        : moment === 'paused' ? sceneSvg('nap', 'none')
        : moment === 'build' ? herdSvg(lanes.map(t => ({ slow: t.status === 'review' })))
        : sceneSvg('sit', STAGE_PROP[s.stage] ?? 'none')
      const alt =
        moment === 'done' ? 'A capybara soaking in a hot spring with a yuzu'
        : moment === 'waiting' ? 'A capybara waiting with a question'
        : moment === 'paused' ? 'A napping capybara'
        : moment === 'build' ? `${lanes.length} capybara${lanes.length > 1 ? 's' : ''} running`
        : `A capybara at the ${LABELS[s.stage] ?? s.stage} stage`
      picture = <Svg source={source} alt={alt} width={SQ} height={SQ} isInteractive />
    } else {
      // Terminal: text art in the same spot, moved by the tick.
      let rows
      if (moment === 'done') {
        const steam = tick % 2 === 0 ? '  ∿ ∿ ∿ ' : '   ∿ ∿ ∿'
        rows = [<Text color="inactive">{steam.replaceAll(' ', NBSP)}</Text>, ...ONSEN.map(row => art(row, 0)), <Text color="suggestion">{'≈'.repeat(14)}</Text>]
      } else if (moment === 'build') {
        const legs = MINI_LEGS[tick % MINI_LEGS.length] ?? MINI[2]!
        rows = [<Text> </Text>, ...MINI.slice(0, 2).map(row => art(row, 2)), art(legs, 2), <Text color="inactive">{'─'.repeat(14)}</Text>]
      } else {
        const mark = moment === 'waiting' ? '?' : moment === 'paused' ? 'z' : ({ preflight: '▤', manifest: '✎', briefing: '…', spec: '◎', plan: '▥', accept: '⌕', between: '·' } as Record<string, string>)[moment] ?? '·'
        const bob = tick % 4 < 2 ? `  ${mark}` : `   ${mark}`
        rows = [<Text color="inactive">{pad(11)}{bob.replaceAll(' ', NBSP)}</Text>, ...SIT.map((row, i) => art(row, 0, i === 3 ? 'inactive' : 'claude'))]
      }
      picture = <Box flexDirection="column" width={16}>{rows}</Box>
    }
    const scene = <Box gap={1}>{picture}{caption}</Box>

    // ── questions (read-only mirror of the engine's own dialog) ──
    const full = e.surface !== 'mobile' ? $.ui.resolve(e) : null
    const heading = (label: string, note?: string) => (
      <Text>
        <Text bold dimColor>{label.toUpperCase()}</Text>
        {note && <Text dimColor>  {note}</Text>}
      </Text>
    )
    let questionBlock = null
    if (s.pending) {
      const n = s.pending.questions.length
      questionBlock = (
        <Box flexDirection="column" gap={1}>
          <Text>
            <Text bold color="claude">YOUR CALL</Text>
            <Text dimColor>  {n} question{n > 1 ? 's' : ''} · answer in Claude Code’s dialog</Text>
          </Text>
          <Box flexDirection="column">
            {s.pending.questions.map((q, i) => (
              <Box flexDirection="column">
                <Text wrap="truncate-end">{i + 1}.  {q.text}</Text>
                {q.default && <Text dimColor wrap="truncate-end">{NBSP.repeat(4)}suggested: {q.default}</Text>}
              </Box>
            ))}
          </Box>
        </Box>
      )
    }

    // ── progress ──
    const stageIdx = Math.max(0, s.stages.findIndex(x => x.id === s.stage))
    const tickets = s.tickets
    const done = tickets.filter(t => t.status === 'done').length
    const barCells = Math.max(10, Math.min(cols - 16, 36))
    const filled = tickets.length ? Math.round((done / tickets.length) * barCells) : 0
    const reqs = s.requirements
    const gatesSeen = Object.values(s.gates).some(v => v !== 'pending')
    const action = await read($, reqAction)
    const usage = await read($, cost)
    const reqsOpen = ['manifest', 'briefing', 'spec', 'plan'].includes(s.stage) || action !== null
    const showReqs = reqs.length > 0 && s.stage !== 'done' && s.stage !== 'preflight'

    return (
      <Box flexDirection="column" gap={2}>
        <Box flexDirection="column">
          <Text bold>
            {s.project}
            {s.paused && <Text color="warning">  · paused</Text>}
          </Text>
          <Text dimColor>{s.mode === 'auto' ? 'auto' : 'ask'} mode · started {clock(s.startedAt)}</Text>
        </Box>

        {scene}

        {questionBlock}

        <Box flexDirection="column">
          <Text>
            <Text bold color={s.stage === 'done' ? 'success' : 'claude'}>{LABELS[s.stage] ?? s.stage}</Text>
            {s.stage !== 'done' && <Text dimColor>  stage {stageIdx + 1} of {s.stages.length}</Text>}
          </Text>
          {!isTerminal && Svg
            ? <Svg source={stepperSvg(px, s.stages.length, stageIdx, s.stage === 'done')} alt={`stage ${stageIdx + 1} of ${s.stages.length}`} width={px} height={10} />
            : (
              <Text>
                {s.stages.map((st, i) => (
                  <Text color={i < stageIdx ? 'success' : i === stageIdx ? 'claude' : 'inactive'}>{i < stageIdx ? '●' : i === stageIdx ? '◉' : '○'}{NBSP}</Text>
                ))}
              </Text>
            )}
          {tickets.length > 0 && (
            <Box flexDirection="column">
              {!isTerminal && Svg
                ? <Svg source={progressSvg(px, done, tickets.length)} alt={`${done} of ${tickets.length} tickets done`} width={px} height={10} />
                : (
                  <Text>
                    <Text color="success">{'█'.repeat(filled)}</Text>
                    <Text color="inactive">{'░'.repeat(barCells - filled)}</Text>
                  </Text>
                )}
              <Text dimColor>{done} of {tickets.length} tickets done</Text>
            </Box>
          )}
          {gatesSeen && (
            <Box flexDirection="column">
              {Object.entries(s.gates).sort(([a], [b]) => a.localeCompare(b)).map(([g, v]) => (
                <Text dimColor wrap="truncate-end">
                  <Text color={GATE_COLOR[v] ?? 'inactive'}>{GATE_MARK[v] ?? '·'}</Text> {GATE_LABEL[g] ?? g}
                </Text>
              ))}
            </Box>
          )}
          {(() => {
            const chosen = modelFor(s.stage)
            const here = usage[s.stage]
            const total = Object.values(usage).reduce((n, c) => n + tokensOf(c), 0)
            if (!chosen && total === 0) return null
            return (
              <Text dimColor wrap="truncate-end">
                {chosen ? `${MODEL_LABEL[chosen] ?? chosen} for this stage` : 'session model'}
                {here ? ` · ${fmtTokens(tokensOf(here))} tokens here` : ''}
                {total > 0 ? ` · ${fmtTokens(total)} total` : ''}
              </Text>
            )
          })()}
          {reqs.length > 0 && s.stage === 'build' && (
            <Text dimColor>{delivered}/{live.length} requirements delivered{reqs.length - live.length ? ` · ${reqs.length - live.length} deferred or dropped` : ''}</Text>
          )}
        </Box>

        {s.stage === 'done' && Object.keys(usage).length > 0 && (() => {
          const rows = s.stages
            .map(st => ({ label: st.label, tokens: usage[st.id] ? tokensOf(usage[st.id]!) : 0, model: shortModel(usage[st.id]?.models ?? []) }))
            .filter(r => r.tokens > 0)
          const total = rows.reduce((n, r) => n + r.tokens, 0)
          const requests = Object.values(usage).reduce((n, c) => n + c.requests, 0)
          const widest = Math.max(1, ...rows.map(r => r.tokens))
          return (
            <Box flexDirection="column" gap={1}>
              {heading('Where the tokens went', `${fmtTokens(total)} in ${requests} requests`)}
              {!isTerminal && Svg
                ? <Svg source={costSvg(px, rows)} alt={rows.map(r => `${r.label} ${fmtTokens(r.tokens)}`).join(', ')} width={px} height={rows.length * 22} />
                : (
                  <Box flexDirection="column">
                    {rows.map(r => (
                      <Text wrap="truncate-end">
                        <Text dimColor>{r.label.padEnd(11)}</Text>
                        <Text color="claude">{'█'.repeat(Math.max(1, Math.round((r.tokens / widest) * 16)))}</Text>
                        <Text dimColor> {Math.round((r.tokens / total) * 100)}% · {fmtTokens(r.tokens)}{r.model ? ` · ${r.model}` : ''}</Text>
                      </Text>
                    ))}
                  </Box>
                )}
            </Box>
          )
        })()}

        {s.stage === 'build' && (
          <Box>
            {s.paused
              ? <Button key="resume" variant="primary" hotkey="r" label="Resume" onPress={() => setPaused($, false)} />
              : <Button key="pause" hotkey="p" label="Pause after this ticket" onPress={() => setPaused($, true)} />}
          </Box>
        )}

        {tickets.length > 0 && (
          <Box flexDirection="column" gap={1}>
            {heading('Tickets', `${done} of ${tickets.length} done`)}
            <Box flexDirection="column">
              {tickets.map(t => (
                <Text color={TICKET_COLOR[t.status] ?? 'inactive'} wrap="truncate-end">
                  {TICKET_MARK[t.status] ?? '○'}  {t.title}
                  <Text dimColor>  {t.id}{t.review ? ' · reviewed' : ''}</Text>
                </Text>
              ))}
            </Box>
          </Box>
        )}

        {showReqs && !reqsOpen && (
          <Box>
            <Button key="reqs-open" label={`Requirements (${reqs.length})`} onPress={() => update($, reqAction, () => ({ id: '*', kind: null }) as ReqAction)} />
          </Box>
        )}

        {showReqs && reqsOpen && (
          <Box flexDirection="column" gap={1}>
            {heading('Requirements', `${live.length} in scope${reqs.length - live.length ? ` · ${reqs.length - live.length} set aside` : ''}`)}
            <Box flexDirection="column">
              {reqs.map(r => {
                const isLive = r.status !== 'dropped' && r.status !== 'deferred'
                const picked = action?.id === r.id
                return (
                  <Box flexDirection="column">
                    <Text color={picked ? 'claude' : undefined} wrap="truncate-end">
                      <Text color={picked ? 'claude' : REQ_COLOR[r.status] ?? 'inactive'}>{picked ? '▸' : isLive ? '●' : '○'}</Text>
                      {`  ${r.quote}`}
                      <Text dimColor>  {r.id}{isLive ? '' : ` · ${r.status}`}</Text>
                    </Text>
                    {r.reason && <Text dimColor wrap="truncate-end">{NBSP.repeat(3)}you: “{r.reason}”</Text>}
                  </Box>
                )
              })}
            </Box>
            {full && (() => {
              const { Input, Select } = full
              const picked = action && action.id !== '*' ? reqs.find(r => r.id === action.id) : undefined
              return (
                <Box flexDirection="column" gap={1}>
                  <Select
                    key="req-pick"
                    value={picked?.id ?? ''}
                    options={[
                      { value: '', label: 'Set a requirement aside…' },
                      ...reqs.filter(r => r.status !== 'dropped' && r.status !== 'deferred').map(r => ({ value: r.id, label: `${r.id} · ${r.quote.length > 42 ? `${r.quote.slice(0, 40)}…` : r.quote}` })),
                    ]}
                    onSelect={v => update($, reqAction, () => (v ? { id: v, kind: null } : { id: '*', kind: null }) as ReqAction)}
                  />
                  {picked && !action?.kind && (
                    <Box gap={1}>
                      <Button key={`defer-${picked.id}`} label="Defer" onPress={() => update($, reqAction, () => ({ id: picked.id, kind: 'defer' }) as ReqAction)} />
                      <Button key={`drop-${picked.id}`} label="Drop" onPress={() => update($, reqAction, () => ({ id: picked.id, kind: 'drop' }) as ReqAction)} />
                      <Button key={`keep-${picked.id}`} label="Keep" onPress={() => update($, reqAction, () => ({ id: '*', kind: null }) as ReqAction)} />
                    </Box>
                  )}
                  {picked && action?.kind && (
                    <Input
                      key="why"
                      autoFocus
                      label={`Why ${action.kind} ${picked.id}? In your words:`}
                      placeholder="e.g. not needed for launch"
                      submitLabel={action.kind === 'drop' ? 'Drop it' : 'Defer it'}
                      onSubmit={v => decideRequirement($, picked.id, action.kind as 'defer' | 'drop', v)}
                    />
                  )}
                  <Input
                    key="add-req"
                    placeholder="Add a requirement in your words"
                    submitLabel="Add"
                    onSubmit={v => addRequirement($, v)}
                  />
                </Box>
              )
            })()}
          </Box>
        )}

        {s.log.length > 0 && (
          <Box flexDirection="column" gap={1}>
            {heading('Activity')}
            <Box flexDirection="column">
              {s.log.slice(-5).reverse().map(l => (
                <Text wrap="truncate-end">
                  <Text dimColor>{clock(l.t)}  </Text>
                  {l.msg}
                </Text>
              ))}
            </Box>
          </Box>
        )}
      </Box>
    )
  })
}
