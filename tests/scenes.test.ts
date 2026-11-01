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
  // The engine resolves the mod's relative paths against the real cwd; the test's project lives at /p.
  const key = (p: string) => (p.startsWith('/p/') ? p : `/p/${p.replace(/^.*?\.briefproof\//, '.briefproof/')}`)
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('session.cwd', async () => ({ value: '/p' }))
  on('fs.list', async (_$, e) => ({ value: [...files.keys()].filter(k => k.startsWith(key(e.path) + '/')).map(k => ({ name: k.slice(key(e.path).length + 1), kind: 'file', size: 1, mtimeMs: 0, isLink: false })) }))
  const copied: string[] = []
  on('ui.copy', async (_$, e) => { copied.push(e.text); return { value: { isCopied: true } } })
  on('ui.toast', async () => ({ value: undefined }))
  const ran: string[][] = []
  on('process.run', async (_$, e) => { ran.push([...e.argv]); return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } })
  on('env.get', async () => ({ value: undefined }))
  on('tool.register', async () => ({ value: { tool: TOOL } }))
  on('fs.exists', async (_$, e) => ({ value: files.has(key(e.path)) || [...files.keys()].some(k => k.startsWith(key(e.path) + '/')) })) // a folder exists when a file is in it
  on('fs.read', async (_$, e) => ({ value: files.get(key(e.path)) ?? '' }))
  on('fs.write', async (_$, e) => { files.set(key(e.path), e.text); return { value: undefined } })
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

  // What you got: one line per stage folder, Open folder runs the OS opener, Copy path copies the root.
  files.set('/p/.briefproof/8-report/report.md', '# Massage booking\n\nBuilt and verified.\n')
  files.set('/p/.briefproof/4-spec/spec.md', 'spec')
  files.set('/p/.briefproof/5-plan/01-service-picker.md', 't1')
  files.set('/p/.briefproof/5-plan/02-time-slots.md', 't2')
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ text: /2  Requirements  1 file/ })).toBeDefined() // written by the mod itself
  expect(files.get('/p/.briefproof/2-manifest/requirements.md')).toMatch(/\| R01 \| clients pick a service and a time \| done \|/)
  expect(await ui.find({ text: /5  Tickets  2 files/ })).toBeDefined()
  expect(await ui.find({ text: /8  Report  1 file/ })).toBeDefined()
  expect(await ui.find({ text: /Acceptance/ })).toBeUndefined() // nothing there yet, so no row
  await ui.press({ key: 'copy-path' })
  expect(copied).toEqual(['/p/.briefproof'])
  await ui.press({ key: 'open-folder' })
  expect(ran).toEqual([['open', '/p/.briefproof']])
  await ui.unmount()

  // On the terminal the folder names are real file:// links (Cmd-click opens them).
  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await term.findAll({ type: 'Link' })).map(l => l.props.href)).toEqual(['file:///p/.briefproof/2-manifest', 'file:///p/.briefproof/4-spec', 'file:///p/.briefproof/5-plan', 'file:///p/.briefproof/8-report'])
  await term.unmount()
})
