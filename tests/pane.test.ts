import { expect, mock, test } from 'claude-code/testing'

const STATE = {
  project: 'Massage booking',
  mode: 'ask',
  stage: 'build',
  stages: ['preflight', 'manifest', 'briefing', 'spec', 'plan', 'build', 'accept', 'done']
    .map(id => ({ id, label: id[0]!.toUpperCase() + id.slice(1) })),
  startedAt: 0,
  updatedAt: 1000,
  requirements: [{ id: 'R01', quote: 'every request lands in a Google Sheet', status: 'in-spec' }],
  tickets: [
    { id: 'T01', title: 'Booking form', reqs: ['R01'], review: true, status: 'running' },
    { id: 'T02', title: 'Google Sheets sync', reqs: ['R01'], review: false, status: 'done' },
  ],
  gates: { G1: 'pass', G2: 'pass', G3: 'pass', G4: 'pending' },
  log: [{ t: 900, msg: 'T02 done · Google Sheets sync' }],
}

const PANE = {
  plugin: 'briefproof',
  component: 'Pane',
  requestId: 'briefproof',
  props: { title: 'Briefproof', isFocused: false, bodyColumns: 50, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

for (const surface of ['terminal', 'desktop'] as const) {
  test(`pane shows the run on ${surface}`, async ($, on) => {
    const clock = mock.clock(on)
    const statuses: (string | undefined)[] = []
    let opens = 0
    let hasFile = false
    on('session.start', async (_$, e) => ({ cwd: e.cwd }))
    on('tool.register', async () => ({ value: { tool: 'mcp__briefproof__state' } }))
    on('fs.exists', async () => ({ value: hasFile }))
    on('fs.read', async () => ({ value: JSON.stringify(STATE) }))
    on('ui.status', async (_$, e) => { statuses.push(e.text); return { value: undefined } })
    on('ui.open', async () => { opens++; return { value: { isPlaced: true } } })

    await $.session.start({ cwd: '/p', surface, isInteractive: true })

    const empty = await $.ui.mount({ ...PANE, surface })
    expect(await empty.find({ text: 'No run in this folder yet' })).toBeDefined()
    await empty.unmount()

    hasFile = true
    await clock.advance(2100)

    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ text: 'Massage booking' })).toBeDefined()
    expect(await ui.find({ text: /Booking form\s+T01/ })).toBeDefined()
    expect(await ui.find({ text: /1 of 2 tickets done/ })).toBeDefined()
    expect(statuses.at(-1)).toBe('briefproof · Build · 1/2 tickets')
    expect(opens).toBe(1)

    await clock.advance(2100) // unchanged file: no second auto-open
    expect(opens).toBe(1)
  })
}
