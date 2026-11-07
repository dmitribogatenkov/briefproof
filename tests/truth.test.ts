import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const TOOL = 'mcp__briefproof__state'

const PANE = {
  plugin: 'briefproof',
  component: 'Pane',
  requestId: 'briefproof',
  props: { title: 'Briefproof', isFocused: false, bodyColumns: 50, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

/** The engine beneath the mod, in memory. */
function world(on: On) {
  const files = new Map<string, string>()
  const prompts: string[] = []
  const commands: string[] = []
  const toasts: string[] = []
  const key = (p: string) => (p.startsWith('/p/') || p.startsWith('/home/d/') ? p : `/p/${p.replace(/^.*?\.briefproof\//, '.briefproof/')}`)
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('session.cwd', async () => ({ value: '/p' }))
  on('tool.register', async () => ({ value: { tool: TOOL } }))
  on('fs.exists', async (_$, e) => ({ value: files.has(key(e.path)) }))
  on('fs.read', async (_$, e) => ({ value: files.get(key(e.path)) ?? '' }))
  on('fs.write', async (_$, e) => { files.set(key(e.path), e.text); return { value: undefined } })
  on('ui.status', async () => ({ value: undefined }))
  on('ui.open', async () => ({ value: { isPlaced: true } }))
  on('ui.toast', async (_$, e) => { toasts.push(e.text); return { value: undefined } })
  on('ui.notify', async () => ({ value: { isSent: true, channel: 'terminal_bell' } }))
  on('prompt.submit', async (_$, e) => { prompts.push(e.text); return { text: e.text } })
  on('command.run', async (_$, e) => { commands.push(`/${e.command}${e.args ? ` ${e.args}` : ''}`); return { text: '' } })
  const ledger = () => {
    const cur = files.get('/p/.briefproof/current')?.trim()
    const path = cur ? `/p/.briefproof/${cur}/state.json` : [...files.keys()].find(k => k.endsWith('/state.json')) ?? ''
    return JSON.parse(files.get(path) ?? 'null')
  }
  return { files, prompts, commands, toasts, ledger }
}

const agentReply = (text: string) => ({ result: { agentId: 'a1', content: [{ type: 'text' as const, text }] } })

test('a subagent spawned for a ticket moves the ticket on, even when the agent never calls set_ticket', async ($, on) => {
  mock.clock(on)
  const w = world(on)
  let reply = 'DONE. Service picker renders the three services with prices.'
  on('tool.call', { tool: 'Agent' }, async () => agentReply(reply))
  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })
  const call = (input: Record<string, unknown>) => $.tool.call({ tool: TOOL, ...input })
  await call({ action: 'init', project: 'Massage booking' })
  await call({ action: 'add_requirements', quotes: ['clients pick a service and a time'] })
  await call({ action: 'add_tickets', tickets: [{ title: 'Service picker', reqs: ['R01'] }, { title: 'Time slots', reqs: ['R01'], review: true }] })
  await call({ action: 'stage', stage: 'build' })

  // T01, no review: the executor's DONE finishes it.
  await $.tool.call({ tool: 'Agent', description: 'Build T01', prompt: 'You are the executor for ticket T01 (Service picker). Read .briefproof/5-plan/01-service-picker.md …' })
  expect(w.ledger().tickets[0].status).toBe('done')
  expect(w.ledger().log.map((l: { msg: string }) => l.msg)).toContain('T01 started · Service picker (seen from the subagent)')

  // T02, marked for review: executor DONE → review; reviewer with no blocking lines → done.
  await $.tool.call({ tool: 'Agent', description: 'Build T02', prompt: 'You are the executor for ticket T02 (Time slots) …' })
  expect(w.ledger().tickets[1].status).toBe('review')
  reply = 'Reviewed. BLOCKING: none. Two nits, listed below.'
  await $.tool.call({ tool: 'Agent', description: 'Review T02', prompt: 'You are the reviewer for ticket T02 …' })
  expect(w.ledger().tickets[1].status).toBe('done')

  // A BLOCKED report leaves the ticket running and says so in the log.
  await call({ action: 'add_tickets', tickets: [{ title: 'Sheets webhook', reqs: ['R01'] }] })
  reply = 'BLOCKED: which Google account owns the sheet?'
  await $.tool.call({ tool: 'Agent', description: 'Build T03', prompt: 'You are the executor for ticket T03 …' })
  expect(w.ledger().tickets[2].status).toBe('running')
  expect(w.ledger().log.at(-1).msg).toBe('T03 blocked, the subagent needs a decision')

  // A spawn that names no ticket is none of the ledger's business.
  const other = await $.tool.call({ tool: 'Agent', description: 'Find the docs', prompt: 'Search the web for the Sheets API quota.' })
  expect(other).toMatchObject({ result: { agentId: 'a1' } })
})

test('pause holds a ticket spawn, not only set_ticket', async ($, on) => {
  mock.clock(on)
  const w = world(on)
  on('tool.call', { tool: 'Agent' }, async () => agentReply('DONE'))
  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })
  const call = (input: Record<string, unknown>) => $.tool.call({ tool: TOOL, ...input })
  await call({ action: 'init', project: 'Massage booking' })
  await call({ action: 'add_requirements', quotes: ['clients pick a service and a time'] })
  await call({ action: 'add_tickets', tickets: [{ title: 'Service picker', reqs: ['R01'] }] })
  await call({ action: 'stage', stage: 'build' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'pause' })
  const spawn = await $.tool.call({ tool: 'Agent', description: 'Build T01', prompt: 'executor for T01' })
  expect(spawn).toMatchObject({ deny: expect.stringMatching(/Paused by the user/) })
  expect(w.ledger().tickets[0].status).toBe('todo')
})

test('the token budget stops new tickets until the user presses Continue', { options: { budget: 1000 } }, async ($, on) => {
  mock.clock(on)
  const w = world(on)
  on('tool.call', { tool: 'Agent' }, async () => agentReply('DONE'))
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn' as const, usage: { model: e.model, input_tokens: 900, output_tokens: 300, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }
  })
  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })
  const call = (input: Record<string, unknown>) => $.tool.call({ tool: TOOL, ...input })
  await call({ action: 'init', project: 'Massage booking' })
  await call({ action: 'add_requirements', quotes: ['clients pick a service and a time'] })
  await call({ action: 'add_tickets', tickets: [{ title: 'Service picker', reqs: ['R01'] }, { title: 'Time slots', reqs: ['R01'] }] })
  await call({ action: 'stage', stage: 'build' })

  // One request of 1200 tokens crosses a 1000-token budget.
  const step = $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 3 })
  for await (const _chunk of step) { /* drain */ }
  await call({ action: 'log', message: 'tick' }) // any ledger write stamps the budget state
  expect(w.ledger().budget).toMatchObject({ limit: 1000, reached: true })
  expect(w.toasts.some(t => /Token budget reached: 1.2k of 1.0k/.test(t))).toBe(true)

  expect((await call({ action: 'set_ticket', id: 'T01', status: 'running' })).deny).toMatch(/Token budget reached/)
  expect(await $.tool.call({ tool: 'Agent', description: 'Build T01', prompt: 'executor for T01' })).toMatchObject({ deny: expect.stringMatching(/Token budget reached/) })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ text: /1.2k of 1.0k token budget/ })).toBeDefined()
  await ui.press({ key: 'continue-budget' })
  expect(w.ledger().budget.waived).toBe(true)
  expect(w.prompts.at(-1)).toMatch(/Continue the Briefproof run/)
  expect((await call({ action: 'set_ticket', id: 'T01', status: 'running' })).result).toMatch(/T01 is running/)
  expect(await ui.find({ key: 'continue-budget' })).toBeUndefined()
})

test('an interrupted run offers Resume until the agent touches the ledger; stages are timed', async ($, on) => {
  const clock = mock.clock(on)
  const w = world(on)
  // A run left at Build by an earlier session.
  w.files.set('/p/.briefproof/state.json', JSON.stringify({
    project: 'Massage booking', mode: 'ask', stage: 'build',
    stages: ['preflight', 'manifest', 'briefing', 'spec', 'plan', 'build', 'accept', 'done'].map(id => ({ id, label: id })),
    startedAt: 0, updatedAt: 1,
    requirements: [{ id: 'R01', quote: 'clients pick a service and a time', status: 'in-spec' }],
    tickets: [{ id: 'T01', title: 'Service picker', reqs: ['R01'], review: false, status: 'done' }, { id: 'T02', title: 'Time slots', reqs: ['R01'], review: false, status: 'todo' }],
    gates: { G1: 'pass', G2: 'pass', G3: 'pass', G4: 'pending' }, log: [],
    timeline: { preflight: { startedAt: 0, endedAt: 60_000 }, build: { startedAt: 60_000 } },
  }))
  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })
  await clock.advance(2100)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ text: /Interrupted/ })).toBeDefined()
  expect(await ui.find({ text: /at Build · 1 of 2 tickets done/ })).toBeDefined()
  await ui.press({ key: 'resume-run' })
  expect(w.commands).toEqual(['/briefproof:build'])
  expect(await ui.find({ key: 'resume-run' })).toBeUndefined()

  // Moving on closes the open stage span; the summary and the end chart carry the minutes.
  const call = (input: Record<string, unknown>) => $.tool.call({ tool: TOOL, ...input })
  await call({ action: 'stage', stage: 'accept' })
  expect(w.ledger().timeline.build.endedAt).toBeDefined()
  expect((await call({ action: 'show' })).result).toMatch(/time by stage: Preflight 1m · Build/)
})

test('a finished run stays in its folder; a change request starts a new run seeded from it', async ($, on) => {
  mock.clock(on)
  const w = world(on)
  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })
  const call = (input: Record<string, unknown>) => $.tool.call({ tool: TOOL, ...input })

  // Nothing to change yet.
  expect((await call({ action: 'init', kind: 'change', request: 'add a cancellation link' })).deny).toMatch(/no finished run/)

  await call({ action: 'init', project: 'Massage booking' })
  const first = w.files.get('/p/.briefproof/current')!.trim()
  w.files.set(`/p/.briefproof/${first}/1-brief/brief.md`, 'A booking page for a small massage studio.\n')
  await call({ action: 'add_requirements', quotes: ['clients pick a service and a time'] })
  // An unfinished run cannot be changed, and a second build is refused too.
  expect((await call({ action: 'init', kind: 'change', request: 'add a cancellation link' })).deny).toMatch(/not finished/)
  expect((await call({ action: 'init', project: 'Another' })).deny).toMatch(/already exists/)
  await call({ action: 'set_requirement', id: 'R01', status: 'done' })
  await call({ action: 'stage', stage: 'done' })

  // The change request: new folder, current pointer moved, brief carries the request, base requirements kept.
  const reply = (await call({ action: 'init', kind: 'change', request: 'add a cancellation link to the confirmation email' })).result
  expect(reply).toMatch(/Change request on "Massage booking" started/)
  const second = w.files.get('/p/.briefproof/current')!.trim()
  expect(second).not.toBe(first)
  const s = w.ledger()
  expect(s).toMatchObject({ kind: 'change', base: `.briefproof/${first}`, request: 'add a cancellation link to the confirmation email', project: 'Massage booking', stage: 'preflight' })
  expect(w.files.get(`/p/.briefproof/${second}/1-brief/brief.md`)).toMatch(/^A booking page for a small massage studio\.\n\n## Change request · \d{4}-\d{2}-\d{2}\n\nadd a cancellation link to the confirmation email\n$/)
  expect(w.files.get(`/p/.briefproof/${second}/1-brief/base-requirements.md`)).toMatch(/\| R01 \| clients pick a service and a time \| done \|/)
  // The first run's file is untouched.
  expect(JSON.parse(w.files.get(`/p/.briefproof/${first}/state.json`)!).stage).toBe('done')
  expect((await call({ action: 'show' })).result).toMatch(/change request on \.briefproof\/runs\//)
})

test('the plan comes with an estimate, from a default first and from past runs after; the user can set a budget for this run', async ($, on) => {
  mock.clock(on)
  const w = world(on)
  // A home with one earlier run on record: 4 tickets, 400k in build, 100k elsewhere, 20 min build, 10 min elsewhere.
  on('env.get', async (_$, e) => ({ value: e.name === 'HOME' ? '/home/d' : undefined }))
  w.files.set('/home/d/.briefproof/stats.json', JSON.stringify({ runs: [{ at: 1, project: 'Earlier', kind: 'build', tickets: 4, tokens: { preflight: 20000, spec: 80000, build: 400000 }, minutes: { spec: 10, build: 20 } }] }))
  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })
  const call = (input: Record<string, unknown>) => $.tool.call({ tool: TOOL, ...input })
  await call({ action: 'init', project: 'Massage booking' })
  await call({ action: 'add_requirements', quotes: ['clients pick a service and a time'] })
  await call({ action: 'stage', stage: 'plan' })
  await call({ action: 'add_tickets', tickets: [{ title: 'A', reqs: ['R01'] }, { title: 'B', reqs: ['R01'] }] })

  // 100k fixed + 2 × 100k per ticket = 300k; 10 min + 2 × 5 min = 20m.
  const shown = (await call({ action: 'show' })).result
  expect(shown).toMatch(/estimate: about 300k tokens and 20m for 2 tickets \(your last 1 run\)/)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ text: /about 300k tokens · 20m for 2 tickets/ })).toBeDefined()
  expect(await ui.find({ text: /based on your last 1 run/ })).toBeDefined()

  // The user sets a budget for this run from the pane; it wins over the settings and shows as a bar.
  await ui.input({ key: 'budget-input', text: '250k' })
  expect(w.ledger().budget).toMatchObject({ limit: 250000, override: true })
  expect(await ui.find({ text: /0 of 250k token budget/ })).toBeDefined()
  expect((await call({ action: 'budget', limit: 0 })).result).toMatch(/Budget removed/)
  await ui.unmount()

  // Finishing the run adds it to the stats file for the next estimate.
  await call({ action: 'stage', stage: 'build' })
  await call({ action: 'set_ticket', id: 'T01', status: 'done' })
  await call({ action: 'set_ticket', id: 'T02', status: 'done' })
  await call({ action: 'set_requirement', id: 'R01', status: 'done' })
  await call({ action: 'stage', stage: 'done' })
  const st = JSON.parse(w.files.get('/home/d/.briefproof/stats.json')!)
  expect(st.runs).toHaveLength(2)
  expect(st.runs[1]).toMatchObject({ project: 'Massage booking', kind: 'build', tickets: 2 })
})

test('with no history the estimate says so', async ($, on) => {
  mock.clock(on)
  world(on)
  on('env.get', async () => ({ value: undefined }))
  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })
  const call = (input: Record<string, unknown>) => $.tool.call({ tool: TOOL, ...input })
  await call({ action: 'init', project: 'Tip calculator' })
  await call({ action: 'add_requirements', quotes: ['enter the bill'] })
  await call({ action: 'stage', stage: 'plan' })
  await call({ action: 'add_tickets', tickets: [{ title: 'A', reqs: ['R01'] }, { title: 'B', reqs: ['R01'] }, { title: 'C', reqs: ['R01'] }] })
  expect((await call({ action: 'show' })).result).toMatch(/estimate: about 270k tokens and 18m for 3 tickets \(a rough default; it learns from your runs\)/)
})

test('token usage survives a new session and does not leak into the next run', async ($, on) => {
  const clock = mock.clock(on)
  const w = world(on)
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn' as const, usage: { model: e.model, input_tokens: 1000, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }
  })
  // A run left mid-build by an earlier session, with 50k already spent.
  w.files.set('/p/.briefproof/current', 'runs/20261101-0900-massage-booking\n')
  w.files.set('/p/.briefproof/runs/20261101-0900-massage-booking/state.json', JSON.stringify({
    dir: '.briefproof/runs/20261101-0900-massage-booking', project: 'Massage booking', mode: 'ask', stage: 'build',
    stages: ['preflight', 'manifest', 'briefing', 'spec', 'plan', 'build', 'accept', 'done'].map(id => ({ id, label: id })),
    startedAt: 0, updatedAt: 1, requirements: [{ id: 'R01', quote: 'q', status: 'in-spec' }],
    tickets: [{ id: 'T01', title: 'A', reqs: ['R01'], review: false, status: 'todo' }], gates: {}, log: [],
    usage: { spec: { requests: 5, input: 50000, output: 0, cacheRead: 0, cacheWrite: 0, models: ['claude-opus-5-5'] } },
  }))
  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })
  await clock.advance(2100)
  const call = (input: Record<string, unknown>) => $.tool.call({ tool: TOOL, ...input })

  // One request in this session adds 1k; the ledger must show 51k, not 1k.
  const step = $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 3 })
  for await (const _c of step) { /* drain */ }
  const shown = (await call({ action: 'show' })).result
  expect(shown).toMatch(/Spec: 50k tokens/)
  expect(shown).toMatch(/Build: 1.0k tokens/)
  expect(shown).toMatch(/total: 51k tokens/)

  // Finish it; the next run in the same session starts from zero, and its init reply names its folder.
  await call({ action: 'set_ticket', id: 'T01', status: 'done' })
  await call({ action: 'set_requirement', id: 'R01', status: 'done' })
  await call({ action: 'stage', stage: 'done' })
  const reply = (await call({ action: 'init', project: 'Tip calculator' })).result
  expect(reply).toMatch(/Run folder: \.briefproof\/runs\/\d{8}-\d{4}-tip-calculator \(every file of this run goes under it\)/)
  expect(w.ledger().usage).toBeUndefined()
  expect((await call({ action: 'show' })).result).not.toMatch(/usage by stage/)
})
