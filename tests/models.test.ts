import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

const TOOL = 'mcp__briefproof__state'

const PANE = {
  plugin: 'briefproof',
  component: 'Pane',
  requestId: 'briefproof',
  props: { title: 'Briefproof', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
  viewport: { columns: 60, rows: 80 },
} as const

function world(on: On) {
  const files = new Map<string, string>()
  const requested: string[] = []
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  on('tool.register', async () => ({ value: { tool: TOOL } }))
  on('fs.exists', async (_$, e) => ({ value: files.has(e.path) }))
  on('fs.read', async (_$, e) => ({ value: files.get(e.path) ?? '' }))
  on('fs.write', async (_$, e) => { files.set(e.path, e.text); return { value: undefined } })
  on('ui.status', async () => ({ value: undefined }))
  on('ui.open', async () => ({ value: { isPlaced: true } }))
  on('ui.toast', async () => ({ value: undefined }))
  // The engine beneath: answers every model request, reporting which model it used.
  on('turn.step', async function* (_$, e) {
    requested.push(e.model)
    return {
      turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn' as const,
      usage: { model: e.model, input_tokens: 1200, output_tokens: 300, cache_read_input_tokens: 5000, cache_creation_input_tokens: 0 },
    }
  })
  const ledger = () => JSON.parse(files.get([...files.keys()].find(k => k.endsWith('/.briefproof/state.json')) ?? '') ?? 'null')
  return { files, requested, ledger }
}

const step = async ($: Engine, i: number) => {
  const stream = $.turn.step({ turnId: 't1', index: i, model: 'claude-opus-5-5', messageCount: 3 })
  for await (const _chunk of stream) { /* drain */ }
  return stream.result
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`each stage runs on the model the settings name, and its cost is counted (${surface})`, { options: { build: 'sonnet', done: 'haiku' } }, async ($, on) => {
    mock.clock(on)
    const w = world(on)
    await $.session.start({ cwd: '/p', surface, isInteractive: true })
    const call = (input: Record<string, unknown>) => $.tool.call({ tool: TOOL, ...input })

    // No run yet: requests pass through untouched.
    await step($, 0)
    expect(w.requested).toEqual(['claude-opus-5-5'])

    await call({ action: 'init', project: 'Massage booking' })
    await step($, 1) // preflight: 'session' → the session's model stays
    await call({ action: 'stage', stage: 'build' })
    await step($, 2)
    await step($, 3)
    await call({ action: 'stage', stage: 'done' })
    await step($, 4)
    expect(w.requested).toEqual(['claude-opus-5-5', 'claude-opus-5-5', 'sonnet', 'sonnet', 'haiku'])

    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ text: /Haiku for this stage/ })).toBeDefined()
    expect(await ui.find({ text: /26k total/ })).toBeDefined()
    // The run is done: the summary shows where the tokens went.
    expect(await ui.find({ text: /WHERE THE TOKENS WENT/ })).toBeDefined()
    expect(await ui.find({ text: /26k in 4 requests/ })).toBeDefined()
    if (surface === 'terminal') expect(await ui.find({ text: /Build\s+█+ 50% · 13k · Sonnet/ })).toBeDefined()

    // The ledger file carries the usage once the next write happens.
    await call({ action: 'log', message: 'wrap up' })
    const usage = w.ledger().usage
    expect(usage.build.requests).toBe(2)
    expect(usage.build.models).toEqual(['sonnet'])
    expect(usage.preflight.requests).toBe(1)
    expect((await call({ action: 'show' })).result).toMatch(/Build: 13k tokens · 2 requests · sonnet/)
  })
}
