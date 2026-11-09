import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { RunState } from '../types'
import { apply, fmtTokens, mdToHtml, newRun, reportPage, ticketIn, verdictOf } from '../hooks/register'

// One test per bug found by the source review before 0.10.0 shipped; each fails without its fix.

const TOOL = 'mcp__briefproof__state'

/** The engine beneath the mod, in memory: a project at /p, a home at /home/d, and writes that can be made to fail. */
function world(on: On, failWrite: (path: string) => boolean = () => false) {
  const files = new Map<string, string>()
  const toasts: string[] = []
  // Only the test's own home passes through: on a CI runner the real cwd is under /home/ too, and the mod's relative paths resolve there.
  const key = (p: string) => (p.startsWith('/p/') || p.startsWith('/home/d/') ? p : `/p/${p.replace(/^.*?\.briefproof\//, '.briefproof/')}`)
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('session.cwd', async () => ({ value: '/p' }))
  on('tool.register', async () => ({ value: { tool: TOOL } }))
  on('fs.exists', async (_$, e) => ({ value: files.has(key(e.path)) }))
  on('fs.read', async (_$, e) => ({ value: files.get(key(e.path)) ?? '' }))
  on('fs.write', async (_$, e) => {
    if (failWrite(key(e.path))) throw new Error('disk full')
    files.set(key(e.path), e.text)
    return { value: undefined }
  })
  on('env.get', async (_$, e) => ({ value: e.name === 'HOME' ? '/home/d' : undefined }))
  on('ui.status', async () => ({ value: undefined }))
  on('ui.open', async () => ({ value: { isPlaced: true } }))
  on('ui.toast', async (_$, e) => { toasts.push(e.text); return { value: undefined } })
  on('ui.notify', async () => ({ value: { isSent: true, channel: 'terminal_bell' } }))
  on('prompt.submit', async (_$, e) => ({ text: e.text }))
  const ledger = () => {
    const cur = files.get('/p/.briefproof/current')?.trim()
    return JSON.parse(files.get(`/p/.briefproof/${cur}/state.json`) ?? 'null')
  }
  return { files, toasts, ledger }
}

const reply = (text: string) => ({ result: { agentId: 'a1', content: [{ type: 'text' as const, text }] } })

test('1 · a change request that fails half-way leaves the finished run current, and a retry works', async ($, on) => {
  mock.clock(on)
  let failing = false
  const w = world(on, p => failing && p.includes('/1-brief/'))
  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })
  const call = (input: Record<string, unknown>) => $.tool.call({ tool: TOOL, ...input })
  await call({ action: 'init', project: 'Massage booking' })
  const finished = w.files.get('/p/.briefproof/current')
  await call({ action: 'stage', stage: 'done' })

  failing = true
  expect((await call({ action: 'init', kind: 'change', request: 'add a cancellation link' })).deny).toMatch(/internal error/)
  expect(w.files.get('/p/.briefproof/current')).toBe(finished)
  expect((await call({ action: 'show' })).result).toMatch(/Massage booking · Done/)

  failing = false
  expect((await call({ action: 'init', kind: 'change', request: 'add a cancellation link' })).result).toMatch(/Change request on "Massage booking" started/)
  expect(w.ledger()).toMatchObject({ kind: 'change', stage: 'preflight' })
})

test('2 · the Done model covers the turn that finished the run, then a finished run leaves requests alone', { options: { done: 'haiku' } }, async ($, on) => {
  mock.clock(on)
  const w = world(on)
  const models: (string | undefined)[] = []
  on('turn.step', async function* (_$, e) {
    models.push(e.model)
    return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn' as const, usage: { model: e.model, input_tokens: 1000, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }
  })
  on('turn.complete', async (_$, e) => ({ text: e.answer }))
  const step = async (turnId: string, i: number) => {
    const s = $.turn.step({ turnId, index: i, model: 'claude-opus-5-5', messageCount: 1 })
    for await (const _c of s) { /* drain */ }
  }
  const end = (turnId: string, agentId?: string) =>
    $.turn.complete({ turnId, answer: '', durationMs: 1, isAborted: false, reason: 'answer', ...(agentId ? { agentId } : {}) })
  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })
  const call = (input: Record<string, unknown>) => $.tool.call({ tool: TOOL, ...input })
  await call({ action: 'init', project: 'Tip calculator' })
  await call({ action: 'stage', stage: 'done' })

  // The rest of the finishing turn writes the report on the Done model; a subagent ending changes nothing.
  await step('t1', 0)
  w.files.set(`/p/${w.ledger().dir}/8-report/report.md`, '# Tip calculator\n\nWritten after stage done.\n')
  await end('t1-sub', 'a1')
  await step('t1', 1)
  await end('t1')
  expect(models).toEqual(['haiku', 'haiku'])
  expect(w.ledger().usage.done.requests).toBe(2)
  // The end of that turn rewrites the report page with the report now on disk.
  expect(w.files.get(`/p/${w.ledger().dir}/8-report/report.html`)).toMatch(/Written after stage done\./)

  // Afterwards: an unrelated turn in the same folder keeps its own model and is not billed to the run.
  await step('t2', 0)
  await call({ action: 'log', message: 'later' })
  expect(models.at(-1)).toBe('claude-opus-5-5')
  expect(w.ledger().usage.done.requests).toBe(2)
})

test('3 · a subagent verdict is read the way its prompt asks for it', async () => {
  // Executor: a verdict line, not the word inside a sentence.
  expect(verdictOf(reply('DONE\n- the API was BLOCKED by CORS at first; a proxy fixed it'))).toBe('DONE')
  expect(verdictOf(reply('Not DONE yet: two tests fail'))).toBeNull()
  expect(verdictOf(reply('**DONE_WITH_NOTES**\n- slots are UTC'))).toBe('DONE_WITH_NOTES')
  expect(verdictOf(reply('BLOCKED: which Google account owns the sheet?'))).toBe('BLOCKED')
  // Reviewer: the BLOCKING section decides.
  expect(verdictOf(reply('BLOCKING:\n- the executor said DONE but the slot test fails\nLATER: none'), 'reviewer')).toBe('BLOCKED')
  expect(verdictOf(reply('**BLOCKING:** none\n**LATER:** rename a helper'), 'reviewer')).toBe('DONE')
  expect(verdictOf(reply('BLOCKING:\nLATER:\n- add a test'), 'reviewer')).toBe('DONE')
  expect(verdictOf(reply('Looks fine, DONE.'), 'reviewer')).toBeNull()
})

test('3 · a review with a blocking issue keeps the ticket in review', async ($, on) => {
  mock.clock(on)
  const w = world(on)
  let answer = 'DONE'
  on('tool.call', { tool: 'Agent' }, async () => reply(answer))
  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })
  const call = (input: Record<string, unknown>) => $.tool.call({ tool: TOOL, ...input })
  await call({ action: 'init', project: 'Massage booking' })
  await call({ action: 'add_requirements', quotes: ['clients pick a time'] })
  await call({ action: 'add_tickets', tickets: [{ title: 'Time slots', reqs: ['R01'], review: true }] })
  await call({ action: 'stage', stage: 'build' })
  await $.tool.call({ tool: 'Agent', description: 'Build T01', prompt: 'Ticket T01: Time slots. You are implementing exactly this one ticket …' })
  expect(w.ledger().tickets[0].status).toBe('review')
  answer = 'BLOCKING:\n- the executor reported DONE, but slots overlap at midnight\nLATER: none'
  await $.tool.call({ tool: 'Agent', description: 'Review T01', prompt: 'Review of T01 Time slots. You are reviewing it in /p …' })
  expect(w.ledger().tickets[0].status).toBe('review')
  expect(w.ledger().log.at(-1).msg).toBe('T01 review found blocking issues; back for a fix')
})

test('4 · the ticket and the role come from the description and the first line', async () => {
  const s = newRun('x', 'ask')
  s.tickets = Array.from({ length: 100 }, (_, i) => ({ id: `T${String(i + 1).padStart(2, '0')}`, title: `t${i + 1}`, reqs: [], review: false, status: 'todo' }))
  // A ticket whose title says "review" is still built by an executor.
  expect(ticketIn(s, 'T04 · Review page for bookings', 'Ticket T04: Review page for bookings. You are implementing exactly this one ticket')).toMatchObject({ ticket: { id: 'T04' }, role: 'executor' })
  expect(ticketIn(s, 'Build T01 (needs review after)', 'Ticket T01: Service picker.')?.role).toBe('executor')
  expect(ticketIn(s, 'Review T02', 'Review of T02 Time slots. You are reviewing it in /p')?.role).toBe('reviewer')
  // The prompt's own "Ticket T##:" wins over an id the description mentions in passing.
  expect(ticketIn(s, 'After T01: build the booking form', 'Ticket T03: Booking form.')?.ticket.id).toBe('T03')
  // Ids further down the prompt are context, not the ticket.
  expect(ticketIn(s, 'Build the booking form', 'You are implementing the booking form.\nIt reads what T01 wrote.')).toBeNull()
  // Past 99 tickets the ids have three digits.
  expect(ticketIn(s, 'Build T100', 'Ticket T100: t100.')?.ticket.id).toBe('T100')
})

test('5 · going back to a stage adds the second visit to its time', async () => {
  const minute = 60_000
  let s: RunState = { ...newRun('x', 'ask'), stage: 'accept' }
  const now = Date.now()
  s.timeline = { build: { startedAt: now - 30 * minute, endedAt: now - 20 * minute }, accept: { startedAt: now - 20 * minute } }
  s = apply(s, { action: 'stage', stage: 'build' }).next!
  expect(s.timeline!.build!.endedAt).toBeUndefined() // open again, carrying its first 10 minutes
  s = apply(s, { action: 'stage', stage: 'accept' }).next!
  const b = s.timeline!.build!
  expect(b.endedAt! - b.startedAt).toBeGreaterThanOrEqual(10 * minute)
  expect(b.endedAt! - b.startedAt).toBeLessThan(10 * minute + 5000)
  expect(b.endedAt!).toBeGreaterThanOrEqual(now)
})

test('6 · finishing a run twice keeps one stats entry for it', async ($, on) => {
  mock.clock(on)
  const w = world(on)
  w.files.set('/home/d/.briefproof/stats.json', JSON.stringify({ runs: [{ at: 1, project: 'Earlier', kind: 'build', tickets: 2, tokens: {}, minutes: {} }] }))
  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })
  const call = (input: Record<string, unknown>) => $.tool.call({ tool: TOOL, ...input })
  await call({ action: 'init', project: 'Tip calculator' })
  await call({ action: 'stage', stage: 'done' })
  await call({ action: 'stage', stage: 'accept' })
  await call({ action: 'stage', stage: 'done' })
  const runs = JSON.parse(w.files.get('/home/d/.briefproof/stats.json')!).runs
  expect(runs.map((r: { project: string }) => r.project)).toEqual(['Earlier', 'Tip calculator'])
  expect(runs[1].dir).toBe(w.ledger().dir)
})

test('7 · gates belong to the run kind, and G2 and G4 check what they claim', async () => {
  // An adopted project has no G2 or G3.
  const adopt = apply(null, { action: 'init', kind: 'adopt', project: 'p' }).next!
  expect(() => apply(adopt, { action: 'gate', gate: 'G2', result: 'pass' })).toThrow(/gate is one of G1, G4/)

  let s = apply(null, { action: 'init', project: 'p' }).next!
  s = apply(s, { action: 'add_requirements', quotes: ['enter the bill', 'pick a percentage', 'split it'] }).next!
  s = apply(s, { action: 'set_requirement', id: 'R01', status: 'open', reason: 'waiting on the owner' }).next!
  s = apply(s, { action: 'set_requirement', id: 'R02', status: 'in-spec' }).next!
  s = apply(s, { action: 'set_requirement', id: 'R03', status: 'deferred', reason: 'not for launch' }).next!
  // G2: the spec cannot cover the brief while a requirement is still open.
  expect(() => apply(s, { action: 'gate', gate: 'G2', result: 'pass' })).toThrow(/G2 R01 is still open/)
  s = apply(s, { action: 'set_requirement', id: 'R01', status: 'in-spec' }).next!
  expect(apply(s, { action: 'gate', gate: 'G2', result: 'pass' }).reply).toBe('G2 pass.')
  // G4: every live requirement verified (done) or found missing (broken); deferred ones do not count.
  expect(() => apply(s, { action: 'gate', gate: 'G4', result: 'pass' })).toThrow(/G4 R01 is in-spec[\s\S]*G4 R02 is in-spec/)
  s = apply(s, { action: 'set_requirement', id: 'R01', status: 'done' }).next!
  s = apply(s, { action: 'set_requirement', id: 'R02', status: 'broken' }).next!
  expect(apply(s, { action: 'gate', gate: 'G4', result: 'pass' }).reply).toBe('G4 pass.')
  // A fail can always be recorded.
  expect(apply(adopt, { action: 'gate', gate: 'G4', result: 'fail' }).reply).toBe('G4 fail.')
})

test('8 · a new budget limit starts clean: Continue on the old one does not carry over', { options: { budget: 1000 } }, async ($, on) => {
  const clock = mock.clock(on)
  const w = world(on)
  // A run that crossed an earlier 500-token setting and was continued; the setting is 1000 now and the run has spent 1.2k.
  w.files.set('/p/.briefproof/current', 'runs/20261101-0900-massage-booking\n')
  w.files.set('/p/.briefproof/runs/20261101-0900-massage-booking/state.json', JSON.stringify({
    dir: '.briefproof/runs/20261101-0900-massage-booking', project: 'Massage booking', mode: 'ask', stage: 'build',
    stages: ['preflight', 'manifest', 'briefing', 'spec', 'plan', 'build', 'accept', 'done'].map(id => ({ id, label: id })),
    startedAt: 0, updatedAt: 1, requirements: [{ id: 'R01', quote: 'q', status: 'in-spec' }],
    tickets: [{ id: 'T01', title: 'A', reqs: ['R01'], review: false, status: 'todo' }], gates: {}, log: [],
    usage: { build: { requests: 2, input: 1200, output: 0, cacheRead: 0, cacheWrite: 0, models: [] } },
    budget: { limit: 500, reached: true, waived: true },
  }))
  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })
  await clock.advance(2100)
  const call = (input: Record<string, unknown>) => $.tool.call({ tool: TOOL, ...input })
  await call({ action: 'log', message: 'tick' })
  expect(w.ledger().budget).toMatchObject({ limit: 1000, reached: true, waived: false })
  expect(w.toasts.some(t => /Token budget reached: 1.2k of 1.0k/.test(t))).toBe(true)
  expect((await call({ action: 'set_ticket', id: 'T01', status: 'running' })).deny).toMatch(/Token budget reached/)
})

test('a reason given for setting a requirement aside does not follow it back into scope', async () => {
  let s = apply(null, { action: 'init', project: 'p' }).next!
  s = apply(s, { action: 'add_requirements', quotes: ['enter the bill'] }).next!
  s = apply(s, { action: 'set_requirement', id: 'R01', status: 'deferred', reason: 'not for launch' }).next!
  s = apply(s, { action: 'set_requirement', id: 'R01', status: 'open' }).next!
  expect(s.requirements[0]!.reason).toBeUndefined()
  expect(() => apply(s, { action: 'gate', gate: 'G1', result: 'pass' })).toThrow(/R01 still open with no reason/)
  // Open with a reason of its own is still a settled state for G1.
  s = apply(s, { action: 'set_requirement', id: 'R01', status: 'open', reason: 'waiting on the owner' }).next!
  expect(apply(s, { action: 'gate', gate: 'G1', result: 'pass' }).reply).toBe('G1 pass.')
})

test('evidence paths are checked by segment', async () => {
  let s = apply(null, { action: 'init', project: 'p' }).next!
  s = apply(s, { action: 'add_requirements', quotes: ['enter the bill'] }).next!
  const set = (files: string[]) => apply(s, { action: 'set_requirement', id: 'R01', status: 'done', files })
  expect(() => set(['src/../../secrets.txt'])).toThrow(/relative to the project root/)
  expect(() => set(['../other/x.ts'])).toThrow(/relative to the project root/)
  expect(set(['..env.sample', './src/./tip.ts', 'src//split.ts']).next!.requirements[0]!.files).toEqual(['..env.sample', 'src/tip.ts', 'src/split.ts'])
})

test('token counts round before the unit is picked', async () => {
  expect([999, 1000, 9_949, 9_999, 51_000, 999_499, 999_999, 1_234_567].map(fmtTokens))
    .toEqual(['999', '1.0k', '9.9k', '10k', '51k', '999k', '1.00M', '1.23M'])
})

test('the report page escapes what it is given, and a quote with a line break stays one table row', async ($, on) => {
  mock.clock(on)
  const w = world(on)
  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })
  const call = (input: Record<string, unknown>) => $.tool.call({ tool: TOOL, ...input })
  await call({ action: 'init', project: 'Tip <b>calc</b>' })
  await call({ action: 'add_requirements', quotes: ['shows <script>alert(1)</script>\n  on | two lines'] })
  expect(w.files.get(`/p/${w.ledger().dir}/2-manifest/requirements.md`)).toMatch(/^\| R01 \| shows <script>alert\(1\)<\/script> on \\\| two lines \| open \|/m)
  const html = reportPage(w.ledger(), '####### deep\n\n[x](javascript:alert(1)) <img src=x>')
  expect(html).not.toMatch(/<script>|<img|<b>calc|<h7>|href="javascript/)
  expect(html).toMatch(/Tip &lt;b&gt;calc&lt;\/b&gt;/)
  expect(mdToHtml('###### six')).toBe('<h6>six</h6>')
})

test('requirements added from the pane go under the last heading of the brief, one after another', async ($, on) => {
  mock.clock(on)
  const w = world(on)
  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })
  const call = (input: Record<string, unknown>) => $.tool.call({ tool: TOOL, ...input })
  await call({ action: 'init', project: 'Massage booking' })
  // A change run's brief: the base's Additions sit above the change request.
  const brief = `/p/${w.ledger().dir}/1-brief/brief.md`
  w.files.set(brief, 'A booking page.\n\n## Additions\n\n- show prices\n\n## Change request · 2026-11-09\n\nadd a cancellation link\n')
  await call({ action: 'add_requirements', quotes: ['add a cancellation link'] })
  await call({ action: 'stage', stage: 'spec' })
  const ui = await $.ui.mount({ plugin: 'briefproof', component: 'Pane', requestId: 'briefproof', surface: 'desktop', props: { title: 'Briefproof', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} } })
  await Promise.all([ui.input({ key: 'add-req', text: 'the link expires after a day' }), ui.input({ key: 'add-req', text: 'the owner is told' })])
  expect(w.files.get(brief)).toMatch(/add a cancellation link\n\n## Additions\n\n- the link expires after a day\n\n- the owner is told\n$/)
  expect(w.ledger().requirements.map((r: { id: string }) => r.id)).toEqual(['R01', 'R02', 'R03'])
})
