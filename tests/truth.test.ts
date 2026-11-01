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
  const key = (p: string) => (p.startsWith('/p/') ? p : `/p/${p.replace(/^.*?\.briefproof\//, '.briefproof/')}`)
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
  const ledger = () => JSON.parse(files.get('/p/.briefproof/state.json') ?? 'null')
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
