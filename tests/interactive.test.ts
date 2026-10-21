import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const TOOL = 'mcp__briefproof__state'

const PANE = {
  plugin: 'briefproof',
  component: 'Pane',
  requestId: 'briefproof',
  props: { title: 'Briefproof', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
  viewport: { columns: 60, rows: 80 },
} as const

/** The engine beneath the mod, in memory: files, prompts the mod sends, toasts and notifications. */
function world(on: On) {
  const files = new Map<string, string>()
  const prompts: string[] = []
  const toasts: string[] = []
  const notices: string[] = []
  const key = (p: string) => (p.startsWith('/') ? p : `/p/${p}`)
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('tool.register', async () => ({ value: { tool: TOOL } }))
  on('fs.exists', async (_$, e) => ({ value: files.has(key(e.path)) }))
  on('fs.read', async (_$, e) => ({ value: files.get(key(e.path)) ?? '' }))
  on('fs.write', async (_$, e) => { files.set(key(e.path), e.text); return { value: undefined } })
  on('ui.status', async () => ({ value: undefined }))
  on('ui.open', async () => ({ value: { isPlaced: true } }))
  on('ui.toast', async (_$, e) => { toasts.push(e.text); return { value: undefined } })
  on('ui.notify', async (_$, e) => { notices.push(e.text); return { value: { isSent: true, channel: 'terminal_bell' } } })
  on('prompt.submit', async (_$, e) => { prompts.push(e.text); return { text: e.text } })
  const ledger = () => {
    const path = [...files.keys()].find(k => k.endsWith('/.briefproof/state.json'))
    return JSON.parse(files.get(path ?? '') ?? 'null')
  }
  const brief = () => files.get([...files.keys()].find(k => k.endsWith('/.briefproof/brief.md')) ?? '') ?? ''
  return { files, prompts, toasts, notices, ledger, brief }
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the engine's question dialog is mirrored in the pane while it is open (${surface})`, async ($, on) => {
    const clock = mock.clock(on)
    const w = world(on)
    let release!: () => void
    const gate = new Promise<void>(r => { release = r })
    on('tool.call', { tool: 'AskUserQuestion' }, async () => { await gate; return { result: { answers: { 'Where should it run?': 'Vercel' } } } })
    await $.session.start({ cwd: '/p', surface, isInteractive: true })
    const call = (input: Record<string, unknown>) => $.tool.call({ tool: TOOL, ...input })
    await call({ action: 'init', project: 'Massage booking' })

    const asking = $.tool.call({ tool: 'AskUserQuestion', questions: [
      { question: 'Where should it run?', header: 'Hosting', options: [{ label: 'Vercel' }, { label: 'Netlify' }], multiSelect: false },
      { question: 'Should clients pay when booking?', header: 'Payment', options: [{ label: 'No' }, { label: 'Card payment' }], multiSelect: false },
    ] })
    await clock.settle()

    expect(w.ledger().pending.questions).toHaveLength(2)
    expect(w.notices).toEqual(['Briefproof has 2 questions for you'])
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ text: 'Waiting for you' })).toBeDefined()
    expect(await ui.find({ text: /suggested: Vercel/ })).toBeDefined()

    release()
    const answered = await asking
    expect(answered.result).toMatchObject({ answers: { 'Where should it run?': 'Vercel' } })
    expect(w.ledger().pending).toBeUndefined()
    expect(w.ledger().log.at(-1).msg).toBe('Answers received')
    expect(w.prompts).toEqual([]) // nothing is sent on the user's behalf
  })

  test(`requirements can be dropped or added in the user's own words (${surface})`, async ($, on) => {
    mock.clock(on)
    const w = world(on)
    await $.session.start({ cwd: '/p', surface, isInteractive: true })
    const call = (input: Record<string, unknown>) => $.tool.call({ tool: TOOL, ...input })
    await call({ action: 'init', project: 'Massage booking' })
    // The brief sits beside the ledger, wherever the engine resolved it.
    const dir = [...w.files.keys()].find(k => k.endsWith('/state.json'))?.replace(/state\.json$/, '') ?? ''
    w.files.set(`${dir}brief.md`, 'A booking page for a small massage studio.\n')
    await call({ action: 'add_requirements', quotes: ['clients pick a service', 'the owner gets an email'] })
    await call({ action: 'stage', stage: 'spec' })

    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.select({ key: 'req-pick', value: 'R02' })
    await ui.press({ key: 'drop-R02' })
    await ui.input({ key: 'why', text: 'she checks the sheet anyway' })

    const r02 = w.ledger().requirements[1]
    expect(r02.status).toBe('dropped')
    expect(r02.reason).toBe('she checks the sheet anyway')
    expect(w.prompts.at(-1)).toBe('I dropped R02 ("the owner gets an email"). In my words: "she checks the sheet anyway". Please update the spec and plan to match.')

    await ui.input({ key: 'add-req', text: 'show prices next to each service' })
    expect(w.ledger().requirements[2]).toMatchObject({ id: 'R03', quote: 'show prices next to each service', status: 'open' })
    expect(w.brief()).toMatch(/## Additions\n\n- show prices next to each service\n$/)
    expect(w.prompts.at(-1)).toMatch(/^New requirement R03/)
  })

  test(`pause holds new tickets until the user resumes (${surface})`, async ($, on) => {
    mock.clock(on)
    const w = world(on)
    await $.session.start({ cwd: '/p', surface, isInteractive: true })
    const call = (input: Record<string, unknown>) => $.tool.call({ tool: TOOL, ...input })
    await call({ action: 'init', project: 'Massage booking' })
    await call({ action: 'add_requirements', quotes: ['clients pick a service'] })
    await call({ action: 'add_tickets', tickets: [{ title: 'Service picker', reqs: ['R01'] }, { title: 'Polish', reqs: ['R01'] }] })
    await call({ action: 'stage', stage: 'build' })
    await call({ action: 'set_ticket', id: 'T01', status: 'running' })

    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'pause' })
    expect(w.ledger().paused).toBe(true)

    expect((await call({ action: 'set_ticket', id: 'T01', status: 'done' })).result).toMatch(/paused the run/)
    expect((await call({ action: 'set_ticket', id: 'T02', status: 'running' })).deny).toMatch(/Paused by the user/)

    await ui.press({ key: 'resume' })
    expect(w.ledger().paused).toBe(false)
    expect(w.prompts.at(-1)).toBe('Resume the Briefproof run.')
    expect((await call({ action: 'set_ticket', id: 'T02', status: 'running' })).result).toMatch(/T02 is running/)
  })

}
