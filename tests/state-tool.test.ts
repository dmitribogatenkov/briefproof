import { expect, mock, test } from 'claude-code/testing'

const TOOL = 'mcp__briefproof__state'

const PANE = {
  plugin: 'briefproof',
  component: 'Pane',
  requestId: 'briefproof',
  props: { title: 'Briefproof', isFocused: false, bodyColumns: 50, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the state tool runs a whole plan and drives the pane on ${surface}`, async ($, on) => {
    mock.clock(on)
    const files = new Map<string, string>()
    const registered: string[] = []
    let opens = 0
    on('session.start', async (_$, e) => ({ cwd: e.cwd }))
    on('tool.register', async (_$, e) => { registered.push(e.name); return { value: { tool: TOOL } } })
    on('fs.exists', async (_$, e) => ({ value: files.has(e.path) }))
    on('fs.read', async (_$, e) => ({ value: files.get(e.path) ?? '' }))
    on('fs.write', async (_$, e) => { files.set(e.path, e.text); return { value: undefined } })
    on('ui.status', async () => ({ value: undefined }))
    on('ui.open', async () => { opens++; return { value: { isPlaced: true } } })

    await $.session.start({ cwd: '/p', surface, isInteractive: true })
    expect(registered).toEqual(['state'])

    const call = (input: Record<string, unknown>) => $.tool.call({ tool: TOOL, ...input })

    // Never asks the user to approve the ledger.
    expect((await $.tool.check({ tool: TOOL, input: { action: 'show' } })).decision).toBe('allow')

    // Nothing to show before init.
    expect((await call({ action: 'show' })).deny).toMatch(/call init first/)

    expect((await call({ action: 'init', project: 'Massage booking' })).result).toMatch(/started/)
    expect((await call({ action: 'init', project: 'Again' })).deny).toMatch(/already exists/)
    expect(opens).toBe(1)

    const reqs = await call({ action: 'add_requirements', quotes: ['clients pick a service and a time', 'every request lands in a Google Sheet'] })
    expect(reqs.result).toBe('Added R01, R02.')

    // G1 cannot pass while a requirement is open without a reason.
    expect((await call({ action: 'gate', gate: 'G1', result: 'pass' })).deny).toMatch(/R01 still open/)
    // Dropping needs the user's own words.
    expect((await call({ action: 'set_requirement', id: 'R02', status: 'dropped' })).deny).toMatch(/needs reason/)

    await call({ action: 'set_requirement', id: 'r01', status: 'in-spec' })
    await call({ action: 'set_requirement', id: 'R02', status: 'in-spec' })
    expect((await call({ action: 'gate', gate: 'G1', result: 'pass' })).result).toBe('G1 pass.')

    // A ticket that traces nowhere is flagged at once, and G3 refuses to pass.
    const plan = await call({ action: 'add_tickets', tickets: [
      { title: 'Booking form', reqs: ['R01'], review: true },
      { title: 'Stray idea', reqs: [] },
    ] })
    expect(plan.result).toMatch(/^Added T01, T02\./)
    expect(plan.result).toMatch(/T02 traces to no requirement/)
    expect(plan.result).toMatch(/R02 is in the spec but in no ticket/)
    expect((await call({ action: 'gate', gate: 'G3', result: 'pass' })).deny).toMatch(/G3 cannot pass/)

    await call({ action: 'stage', stage: 'build' })
    expect((await call({ action: 'set_ticket', id: 'T01', status: 'done' })).result).toBe('T01 is done. 1/2 done.')

    const path = [...files.keys()].find(k => k.endsWith('/.briefproof/state.json'))
    expect(path).toBeDefined()
    const saved = JSON.parse(files.get(path ?? '') ?? '{}')
    expect(saved.stage).toBe('build')
    expect(saved.tickets[0].status).toBe('done')

    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ text: 'Massage booking' })).toBeDefined()
    expect(await ui.find({ text: /Booking form\s+T01/ })).toBeDefined()
    expect(await ui.find({ text: /T01 done · Booking form/ })).toBeDefined()

    expect((await call({ action: 'show' })).result).toMatch(/Massage booking · Build · mode ask/)
    expect((await call({ action: 'nonsense' })).deny).toMatch(/unknown action/)
  })
}
