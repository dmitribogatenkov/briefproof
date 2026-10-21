import { expect, mock, test } from 'claude-code/testing'

const TOOL = 'mcp__briefproof__state'

const PANE = {
  plugin: 'briefproof',
  component: 'Pane',
  requestId: 'briefproof',
  props: { title: 'Briefproof', isFocused: false, bodyColumns: 50, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

/** Every stage gets its own capybara and its own caption, in a square beside the text. */
test('each stage shows a different capybara with a caption of its own (desktop)', async ($, on) => {
  mock.clock(on)
  const files = new Map<string, string>()
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('tool.register', async () => ({ value: { tool: TOOL } }))
  on('fs.exists', async (_$, e) => ({ value: files.has(e.path) }))
  on('fs.read', async (_$, e) => ({ value: files.get(e.path) ?? '' }))
  on('fs.write', async (_$, e) => { files.set(e.path, e.text); return { value: undefined } })
  on('ui.status', async () => ({ value: undefined }))
  on('ui.open', async () => ({ value: { isPlaced: true } }))
  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })
  const call = (input: Record<string, unknown>) => $.tool.call({ tool: TOOL, ...input })
  await call({ action: 'init', project: 'Massage booking' })
  await call({ action: 'add_requirements', quotes: ['clients pick a service and a time'] })

  const sceneAt = async () => {
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    const svg = await ui.find({ type: 'Svg' })
    const alt = (svg?.props as { alt?: string } | undefined)?.alt ?? ''
    const text = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')
    await ui.unmount()
    return { alt, text }
  }

  const seen = new Set<string>()
  const expectations: [string, RegExp, RegExp][] = [
    ['preflight', /Preflight stage/, /Reading the brief/],
    ['manifest', /Manifest stage/, /Copying your words/],
    ['briefing', /Briefing stage/, /Working out what to ask/],
    ['spec', /Spec stage/, /Writing the spec/],
    ['plan', /Plan stage/, /Cutting tickets/],
    ['accept', /Acceptance stage/, /Blind check in progress/],
  ]
  for (const [stage, alt, title] of expectations) {
    await call({ action: 'stage', stage })
    const s = await sceneAt()
    expect(s.alt).toMatch(alt)
    expect(s.text).toMatch(title)
    seen.add(s.alt)
  }
  expect(seen.size).toBe(expectations.length)

  // Build: the running herd, one per ticket in progress, and the ticket titles beside it.
  await call({ action: 'add_tickets', tickets: [{ title: 'Service picker', reqs: ['R01'] }, { title: 'Time slots', reqs: ['R01'] }] })
  await call({ action: 'stage', stage: 'build' })
  expect((await sceneAt()).text).toMatch(/Between tickets/)
  await call({ action: 'set_ticket', id: 'T01', status: 'running' })
  await call({ action: 'set_ticket', id: 'T02', status: 'running' })
  const build = await sceneAt()
  expect(build.alt).toBe('2 capybaras running')
  expect(build.text).toMatch(/2 at work/)
  expect(build.text).toMatch(/Service picker · Time slots/)

  // Done: the hot spring.
  await call({ action: 'set_ticket', id: 'T01', status: 'done' })
  await call({ action: 'set_ticket', id: 'T02', status: 'done' })
  await call({ action: 'set_requirement', id: 'R01', status: 'done' })
  await call({ action: 'stage', stage: 'done' })
  const done = await sceneAt()
  expect(done.alt).toMatch(/hot spring/)
  expect(done.text).toMatch(/All done · 1\/1 requirements delivered/)
})
