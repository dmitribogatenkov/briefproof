import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const TOOL = 'mcp__briefproof__state'

const PANE = {
  plugin: 'briefproof',
  component: 'Pane',
  requestId: 'briefproof',
  props: { title: 'Briefproof', isFocused: false, bodyColumns: 50, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

const hash = (t: string) => { let h = 0x811c9dc5; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 } return h.toString(16).padStart(8, '0') }

/** The engine beneath the mod, in memory: a project at /p with a few source files. */
function world(on: On) {
  const files = new Map<string, string>()
  const commands: string[] = []
  const toasts: string[] = []
  const statuses: (string | undefined)[] = []
  // The engine resolves the mod's relative .briefproof paths against the real cwd; the project files are read via the session cwd, /p.
  const key = (p: string) => (p.startsWith('/p/') ? p : `/p/${p.replace(/^.*?\.briefproof\//, '.briefproof/')}`)
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('session.cwd', async () => ({ value: '/p' }))
  on('tool.register', async () => ({ value: { tool: TOOL } }))
  on('fs.exists', async (_$, e) => ({ value: files.has(key(e.path)) || [...files.keys()].some(k => k.startsWith(key(e.path) + '/')) }))
  on('fs.read', async (_$, e) => ({ value: files.get(key(e.path)) ?? '' }))
  on('fs.write', async (_$, e) => { files.set(key(e.path), e.text); return { value: undefined } })
  on('fs.list', async (_$, e) => ({ value: [...files.keys()].filter(k => k.startsWith(key(e.path) + '/')).map(k => ({ name: k.slice(key(e.path).length + 1), kind: 'file', size: 1, mtimeMs: 0, isLink: false })) }))
  on('env.get', async () => ({ value: undefined }))
  on('ui.status', async (_$, e) => { statuses.push(e.text); return { value: undefined } })
  on('ui.open', async () => ({ value: { isPlaced: true } }))
  on('ui.toast', async (_$, e) => { toasts.push(e.text); return { value: undefined } })
  on('ui.notify', async () => ({ value: { isSent: true, channel: 'terminal_bell' } }))
  on('prompt.submit', async (_$, e) => ({ text: e.text }))
  on('command.run', async (_$, e) => { commands.push(`/${e.command}${e.args ? ` ${e.args}` : ''}`); return { text: '' } })
  const ledger = () => {
    const cur = files.get('/p/.briefproof/current')?.trim()
    return JSON.parse(files.get(`/p/.briefproof/${cur}/state.json`) ?? 'null')
  }
  return { files, commands, toasts, statuses, ledger }
}

test('a finished run remembers the files behind each requirement and warns when they change; Re-check and snapshot clear it', async ($, on) => {
  mock.clock(on)
  const w = world(on)
  w.files.set('/p/src/picker.ts', 'export const services = ["Swedish", "Deep tissue"]\n')
  w.files.set('/p/src/slots.ts', 'export const slots = () => []\n')
  w.files.set('/p/src/sheet.ts', 'export const append = () => {}\n')
  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })
  const call = (input: Record<string, unknown>) => $.tool.call({ tool: TOOL, ...input })
  await call({ action: 'init', project: 'Massage booking' })
  await call({ action: 'add_requirements', quotes: ['clients pick a service and a time', 'every request lands in a Google Sheet'] })
  await call({ action: 'add_tickets', tickets: [{ title: 'Booking form', reqs: ['R01', 'R02'] }] })
  await call({ action: 'stage', stage: 'build' })
  await call({ action: 'set_ticket', id: 'T01', status: 'done' })
  await call({ action: 'stage', stage: 'accept' })
  // The acceptance step records where each requirement lives, as the blind checker named it.
  const r1 = await call({ action: 'set_requirement', id: 'R01', status: 'done', files: ['./src/picker.ts', 'src/slots.ts'], note: 'GET / lists 2 services; picking one shows slots' })
  expect(r1.result).toMatch(/R01 is done\. Watching 2 files for it\./)
  await call({ action: 'set_requirement', id: 'R02', status: 'done', files: ['src/sheet.ts'], note: 'POST /book appended a row to the stub sheet' })
  expect(w.files.get(`/p/${w.ledger().dir}/2-manifest/requirements.md`)).toMatch(/\| R01 \| clients pick a service and a time \| done \| src\/picker\.ts, src\/slots\.ts · GET \/ lists 2 services/)

  // Done takes the proof: one hash per evidence file.
  await call({ action: 'stage', stage: 'done' })
  const proof = w.ledger().proof
  expect(Object.keys(proof.files).sort()).toEqual(['src/picker.ts', 'src/sheet.ts', 'src/slots.ts'])
  expect((await call({ action: 'show' })).result).toMatch(/proof: 3 evidence files unchanged since/)
  const html = w.files.get(`/p/${w.ledger().dir}/8-report/report.html`) ?? ''
  expect(html).toMatch(/<code>src\/picker\.ts<\/code> <code>src\/slots\.ts<\/code>/)
  expect(html).toMatch(/Evidence last checked .* across 3 files\./)
  // Nothing moved: no warning, hot spring as usual.
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ text: /Changed since the last check/ })).toBeUndefined()
  expect(await ui.find({ text: /All done · 2\/2 requirements delivered/ })).toBeDefined()
  await ui.unmount()
  expect(w.commands).toEqual([])
})

test('a new session on a finished run whose files moved shows what is stale, offers Re-check, and show says so', { options: { accept: 'opus', done: 'haiku' } }, async ($, on) => {
  const clock = mock.clock(on)
  const w = world(on)
  const requested: (string | undefined)[] = []
  on('turn.step', async function* (_$, e) {
    requested.push(e.model)
    return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn' as const, usage: { model: e.model, input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }
  })
  // A finished run from an earlier session, with its proof.
  w.files.set('/p/src/picker.ts', 'v1')
  w.files.set('/p/src/slots.ts', 'v1')
  w.files.set('/p/src/sheet.ts', 'v1')
  w.files.set('/p/.briefproof/current', 'runs/20261101-0941-massage-booking\n')
  const dir = '/p/.briefproof/runs/20261101-0941-massage-booking'
  w.files.set(`${dir}/state.json`, JSON.stringify({
    dir: '.briefproof/runs/20261101-0941-massage-booking', kind: 'build',
    project: 'Massage booking', mode: 'ask', stage: 'done',
    stages: ['preflight', 'manifest', 'briefing', 'spec', 'plan', 'build', 'accept', 'done'].map(id => ({ id, label: id })),
    startedAt: 0, updatedAt: 1,
    requirements: [
      { id: 'R01', quote: 'clients pick a service and a time', status: 'done', files: ['src/picker.ts', 'src/slots.ts'] },
      { id: 'R02', quote: 'every request lands in a Google Sheet', status: 'done', files: ['src/sheet.ts'] },
    ],
    tickets: [{ id: 'T01', title: 'Booking form', reqs: ['R01', 'R02'], review: false, status: 'done' }],
    gates: { G1: 'pass', G2: 'pass', G3: 'pass', G4: 'pass' }, log: [],
    proof: { at: 1, files: { 'src/picker.ts': hash('v1'), 'src/slots.ts': hash('v1'), 'src/sheet.ts': hash('v1') } },
  }))
  // Since then: one file edited, one deleted, one untouched.
  w.files.set('/p/src/picker.ts', 'v2')
  w.files.delete('/p/src/sheet.ts')

  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })
  expect(w.toasts).toEqual(['Briefproof: 2 files behind R01, R02 changed since the last check'])
  await clock.advance(2100) // the poll picks the run up
  const call = (input: Record<string, unknown>) => $.tool.call({ tool: TOOL, ...input })
  const shown = (await call({ action: 'show' })).result as string
  expect(shown).toMatch(/drift: 2 evidence files changed since the last check \(src\/picker\.ts, src\/sheet\.ts\); R01, R02 may be stale\. \/briefproof:recheck verifies them again\./)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ text: /Changed since the last check/ })).toBeDefined()
  expect(await ui.find({ text: /2 files · R01, R02 may be stale/ })).toBeDefined()
  expect(await ui.find({ text: /src\/picker\.ts/ })).toBeDefined()
  expect(await ui.find({ text: /2 may be stale/ })).toBeDefined() // the caption
  const svg = await ui.find({ type: 'Svg' })
  expect((svg?.props as { alt?: string }).alt).toMatch(/magnifying glass/)
  expect(w.statuses.at(-1)).toBe('briefproof · Done · 1/1 tickets · 2 may be stale')
  await ui.press({ key: 'recheck' })
  expect(w.commands).toEqual(['/briefproof:recheck'])
  await ui.unmount()
  // The button marks the run as re-checking: the pane says so, the button is gone, and requests route to the Acceptance model.
  expect(w.ledger().rechecking).toBe(true)
  expect(w.statuses.at(-1)).toBe('briefproof · Done · 1/1 tickets · re-checking')
  const during = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await during.find({ text: /Re-check in progress/ })).toBeDefined()
  expect(await during.find({ key: 'recheck' })).toBeUndefined()
  await during.unmount()
  expect((await call({ action: 'recheck' })).result).toMatch(/Re-check in progress: requests now run on the Acceptance model/)
  const step = $.turn.step({ turnId: 't1', index: 0, model: 'claude-sonnet-5-5', messageCount: 3 })
  for await (const _c of step) { /* drain */ }
  expect(requested).toEqual(['opus']) // the Acceptance model from the settings, not the Done one
  await call({ action: 'log', message: 'checker spawned' })
  expect(Object.keys(w.ledger().usage)).toEqual(['accept']) // and counted there

  // Paths from the checker are relative to the project; anything else is refused before it can cause a false alarm.
  expect((await call({ action: 'set_requirement', id: 'R01', status: 'done', files: ['/tmp/clone-7/src/picker.ts'] })).deny).toMatch(/relative to the project root/)
  expect((await call({ action: 'set_requirement', id: 'R01', status: 'done', files: ['node_modules/x/index.js'] })).deny).toMatch(/dependency or build output/)
  await call({ action: 'set_requirement', id: 'R01', status: 'done', files: ['src\\picker.ts'] })
  expect(w.ledger().requirements[0].files).toEqual(['src/picker.ts'])

  // The re-check skill reports: R01 still holds (new file set), R02 broke; then it snapshots.
  await call({ action: 'set_requirement', id: 'R01', status: 'done', files: ['src/picker.ts', 'src/slots.ts'], note: 'GET / still lists 2 services' })
  await call({ action: 'set_requirement', id: 'R02', status: 'broken', note: 'POST /book returns 500: src/sheet.ts is gone' })
  expect(w.ledger().log.at(-1).msg).toBe('R02 no longer holds: POST /book returns 500: src/sheet.ts is gone')
  const snap = await call({ action: 'snapshot' })
  expect(snap.result).toBe('Proof refreshed: 3 files across 2 requirements. The pane warns when any of them changes.')
  expect(w.ledger().proof.files['src/sheet.ts']).toBe('missing')
  expect(w.ledger().proof.files['src/picker.ts']).toBe(hash('v2'))
  expect(w.ledger().rechecking).toBeUndefined()
  expect(w.statuses.at(-1)).toBe('briefproof · Done · 1/1 tickets · 1 no longer holds')

  // The warning is gone; the broken requirement is what the pane shows now.
  const after = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await after.find({ text: /Changed since the last check/ })).toBeUndefined()
  expect(await after.find({ key: 'recheck' })).toBeUndefined()
  expect(await after.find({ text: /No longer holds/ })).toBeDefined()
  expect(await after.find({ text: /1 requirement no longer holds/ })).toBeDefined()
  expect(await after.find({ text: /every request lands in a Google Sheet/ })).toBeDefined()
  await after.unmount()
  expect((await call({ action: 'show' })).result).toMatch(/no longer holds: R02\. Offer \/briefproof:change to fix it\./)
  const html = w.files.get(`${dir}/8-report/report.html`) ?? ''
  expect(html).toMatch(/<span class="pill broken">no longer holds<\/span>/)
  expect(html).toMatch(/1\/2<\/div><div class="l">requirements delivered/)

  // A file that no requirement names any more is not drift, even when it moves.
  await call({ action: 'set_requirement', id: 'R02', status: 'broken', files: ['src/booking.ts'], note: 'moved' })
  await call({ action: 'snapshot' })
  w.files.set('/p/src/sheet.ts', 'back, but unwatched')
  w.files.set('/p/src/booking.ts', 'v1')
  const proof2 = w.ledger().proof
  expect(Object.keys(proof2.files).sort()).toEqual(['src/booking.ts', 'src/picker.ts', 'src/slots.ts'])

  // Snapshot is for finished runs with evidence only.
  const fresh = w.files.get(`${dir}/state.json`)!
  w.files.set(`${dir}/state.json`, fresh.replace('"stage": "done"', '"stage": "accept"'))
  expect((await call({ action: 'snapshot' })).deny).toMatch(/snapshot is for a finished run/)
})

test('adopting an existing project: five stages, no tickets, requirements verified in the code', async ($, on) => {
  mock.clock(on)
  const w = world(on)
  w.files.set('/p/package.json', '{"name":"tipcalc"}')
  w.files.set('/p/src/tip.ts', 'export const tip = (bill: number, pct: number) => bill * pct / 100\n')
  w.files.set('/p/src/split.ts', 'export const split = (total: number, n: number) => total / n\n')
  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })
  const call = (input: Record<string, unknown>) => $.tool.call({ tool: TOOL, ...input })

  const reply = (await call({ action: 'init', kind: 'adopt', project: 'Tip calculator' })).result as string
  expect(reply).toMatch(/Adopting "Tip calculator" in ask mode: five stages/)
  const s0 = w.ledger()
  expect(s0.kind).toBe('adopt')
  expect(s0.stages.map((x: { id: string }) => x.id)).toEqual(['preflight', 'manifest', 'briefing', 'accept', 'done'])
  expect(Object.keys(s0.gates)).toEqual(['G1', 'G4'])
  expect(s0.log[0].msg).toBe('Adopting the project · ask mode')

  // No spec, plan or build for an adopted project, and no tickets.
  expect((await call({ action: 'stage', stage: 'spec' })).deny).toMatch(/stage is one of preflight, manifest, briefing, accept, done \(an adopted project has no spec, plan or build stage\)/)
  expect((await call({ action: 'add_tickets', tickets: [{ title: 'x', reqs: ['R01'] }] })).deny).toMatch(/an adopted project has no tickets/)

  // The pane names it and shows the adopt captions on a five-segment stepper.
  let ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ text: /adopted project · ask mode/ })).toBeDefined()
  expect(await ui.find({ text: /Reading the project/ })).toBeDefined()
  expect(await ui.find({ text: /stage 1 of 5/ })).toBeDefined()
  await ui.unmount()

  await call({ action: 'stage', stage: 'manifest' })
  await call({ action: 'add_requirements', quotes: ['computes the tip from the bill and a percentage', 'splits the total between any number of people', 'rounds to the nearest cent'] })
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ text: /Writing down what it does/ })).toBeDefined()
  await ui.unmount()
  await call({ action: 'stage', stage: 'briefing' })
  // The owner confirms the list; G1 waits for that.
  expect((await call({ action: 'gate', gate: 'G1', result: 'pass' })).deny).toMatch(/G1 cannot pass yet/)
  for (const id of ['R01', 'R02', 'R03']) await call({ action: 'set_requirement', id, status: 'in-spec' })
  expect((await call({ action: 'gate', gate: 'G1', result: 'pass' })).result).toBe('G1 pass.')
  await call({ action: 'stage', stage: 'accept' })
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ text: /Verifying each line in the code/ })).toBeDefined()
  await ui.unmount()

  // The blind checker found two in the code; the third was claimed by the README and is not there.
  await call({ action: 'set_requirement', id: 'R01', status: 'done', files: ['src/tip.ts'], note: 'tip(100, 15) = 15' })
  await call({ action: 'set_requirement', id: 'R02', status: 'done', files: ['src/split.ts'], note: 'split(30, 3) = 10' })
  await call({ action: 'set_requirement', id: 'R03', status: 'broken', note: 'no rounding anywhere; tip(10, 33) = 3.3000000000000003' })
  await call({ action: 'gate', gate: 'G4', result: 'pass' })
  w.files.set(`/p/${w.ledger().dir}/8-report/report.md`, '# Tip calculator\n\nWhat it does today.\n')
  await call({ action: 'stage', stage: 'done' })

  const s = w.ledger()
  expect(s.tickets).toEqual([])
  expect(Object.keys(s.proof.files).sort()).toEqual(['src/split.ts', 'src/tip.ts'])
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ text: /1 requirement no longer holds/ })).toBeDefined() // the README's claim, honestly marked
  expect(await ui.find({ text: /rounds to the nearest cent/ })).toBeDefined()
  expect(await ui.find({ text: /Tickets/ })).toBeUndefined()
  expect(await ui.find({ key: 'open-report' })).toBeDefined()
  await ui.unmount()
  const html = w.files.get(`/p/${s.dir}/8-report/report.html`) ?? ''
  expect(html).toMatch(/Adopted project: what it does today, each line verified in the code/)
  expect(html).toMatch(/2\/3<\/div><div class="l">requirements verified/)
  expect(html).toMatch(/<div class="n">2<\/div><div class="l">files watched/)
  expect(html).not.toMatch(/<h2>Tickets<\/h2>/)
  expect((await call({ action: 'show' })).result).toMatch(/adopted project: the brief describes what it does today/)

  // From here a change request works like on any finished run.
  const change = (await call({ action: 'init', kind: 'change', request: 'round to the nearest cent' })).result as string
  expect(change).toMatch(/Change request on "Tip calculator" started/)
  expect(w.files.get(`/p/${w.ledger().dir}/1-brief/base-requirements.md`)).toMatch(/\| R03 \| rounds to the nearest cent \| broken \|/)
})

test('an interrupted adoption resumes with its own command', async ($, on) => {
  const clock = mock.clock(on)
  const w = world(on)
  w.files.set('/p/.briefproof/current', 'runs/20261101-0941-tipcalc\n')
  w.files.set('/p/.briefproof/runs/20261101-0941-tipcalc/state.json', JSON.stringify({
    dir: '.briefproof/runs/20261101-0941-tipcalc', kind: 'adopt', project: 'Tip calculator', mode: 'ask', stage: 'briefing',
    stages: ['preflight', 'manifest', 'briefing', 'accept', 'done'].map(id => ({ id, label: id })),
    startedAt: 0, updatedAt: 1, requirements: [{ id: 'R01', quote: 'computes the tip', status: 'open' }], tickets: [], gates: { G1: 'pending', G4: 'pending' }, log: [],
  }))
  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })
  await clock.advance(2100)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ text: /Interrupted/ })).toBeDefined()
  await ui.press({ key: 'resume-run' })
  expect(w.commands).toEqual(['/briefproof:adopt'])
  await ui.unmount()
})

test('a change run keeps watching the base run: its evidence is in the proof, and base requirements can go stale', async ($, on) => {
  const clock = mock.clock(on)
  const w = world(on)
  w.files.set('/p/src/picker.ts', 'v1')
  w.files.set('/p/src/sheet.ts', 'v1')
  w.files.set('/p/src/mail.ts', 'v1')
  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })
  const call = (input: Record<string, unknown>) => $.tool.call({ tool: TOOL, ...input })

  // The base run, finished with evidence.
  await call({ action: 'init', project: 'Massage booking' })
  const base = w.ledger().dir
  await call({ action: 'add_requirements', quotes: ['clients pick a service and a time', 'every request lands in a Google Sheet'] })
  await call({ action: 'set_requirement', id: 'R01', status: 'done', files: ['src/picker.ts'] })
  await call({ action: 'set_requirement', id: 'R02', status: 'done', files: ['src/sheet.ts'] })
  await call({ action: 'stage', stage: 'done' })

  // A change on top of it; its own requirement lives in another file.
  await call({ action: 'init', kind: 'change', request: 'add a cancellation link to the confirmation email' })
  await call({ action: 'add_requirements', quotes: ['add a cancellation link to the confirmation email'] })
  await call({ action: 'set_requirement', id: 'R01', status: 'done', files: ['src/mail.ts'], note: 'the email carries /cancel/<token>' })
  await call({ action: 'stage', stage: 'done' })
  const change = w.ledger()
  expect(change.base).toBe(base)
  expect(Object.keys(change.proof.files).sort()).toEqual(['src/mail.ts', 'src/picker.ts', 'src/sheet.ts']) // the base's files too
  expect((await call({ action: 'show' })).result).toMatch(/proof: 3 evidence files unchanged/)

  // A new session after someone edited a base file: the warning names the base requirement as such.
  // (A re-check left half-done in the old session is over; the new session clears the flag.)
  await call({ action: 'recheck' })
  w.files.set('/p/src/sheet.ts', 'v2')
  w.toasts.length = 0
  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })
  expect(w.ledger().rechecking).toBeUndefined()
  expect(w.ledger().log.at(-1).msg).toBe('Re-check did not finish; press Re-check to start it again')
  expect(w.toasts).toEqual(['Briefproof: 1 file behind R02 (base) changed since the last check'])
  await clock.advance(2100)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ text: /1 file · R02 \(base\) may be stale/ })).toBeDefined()
  await ui.unmount()
  // Snapshot works on a change run even when only the base names files.
  expect((await call({ action: 'snapshot' })).result).toMatch(/Proof refreshed: 3 files across 3 requirements \(this run and its base\)/)
})
