import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'session-band',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120 },
} as const

test('the skin button and /skin switch the band live, keep every control and remember the choice', async ($, on) => {
  const saved: Record<string, unknown> = { skin: 'hacker' }
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('store.get', (_, e) => ({ value: saved[e.key] }))
  on('store.set', (_, e) => {
    saved[e.key] = e.value
    return { value: undefined }
  })
  on('session.cwd', () => ({ value: '/Users/x/MyProject' }))
  on('session.usage', () => ({
    value: {
      startedAt: Date.now(),
      context: { tokens: 257_000, window: 1_000_000, percent: 26 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 14 }, { kind: 'seven_day', percentUsed: 57 }],
      cost: { usd: 25.2 },
    },
  }))
  on('process.run', (_, e) => {
    const args = e.argv.join(' ')
    const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
    if (args.includes('--git-common-dir')) return ok('/Users/x/MyProject/.git\n')
    if (args.startsWith('/bin/sh -c printf')) return ok('/Users/x\n')
    if (args.includes('--abbrev-ref')) return ok('main\n')
    return ok(JSON.stringify({ snapshot: { state: 'playing', track: { title: 'Divine', artist: '1000 Handz', station: 'EDM' }, index: 3, total: 15, volume: -21 } }))
  })
  on('clock.every', () => ({ value: undefined }))
  on('fs.exists', (_, e) => ({ value: e.path === '/bin/sh' }))

  await $.session.start({ cwd: '/Users/x/MyProject', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' } as never)
  const text = async (re: RegExp) => (await ui.find({ type: 'Text', text: re }))?.text ?? ''
  const controls = async () => {
    for (const key of ['skin', 'rec', 'handoff', 'prev', 'play', 'next', 'quieter', 'louder']) expect(await ui.find({ key })).toBeDefined()
  }

  // The stored choice opens the session.
  expect(await text(/^myproject$/)).toBe('myproject')
  expect(await text(/tty\/fm/)).toBe(' tty/fm ')
  expect(await text(/5h limit/)).toBe('14% 5h limit')
  await controls()

  await ui.press({ key: 'skin' })
  expect(await text(/^MyProject$/)).toBe('MyProject')
  expect(await text(/^Radio$/)).toBe('Radio')
  expect(await text(/Context/)).toBe('51% Context 257K/500K')
  expect(await text(/Channel 04\/15/)).toBe('● Live · Channel 04/15 · -21 dB')
  expect(saved.skin).toBe('pro')
  await controls()

  await ui.press({ key: 'skin' })
  expect(await text(/NEON FM/)).toBe(' NEON FM ')
  expect(await text(/^MYPROJECT$/)).toBe('MYPROJECT')
  expect(saved.skin).toBe('neon')
  await controls()

  expect((await $.command.run({ command: 'skin', args: 'pro' } as never)) as unknown).toMatchObject({ text: 'Skin: Pro' })
  expect(await text(/^Radio$/)).toBe('Radio')
  expect((await $.command.run({ command: 'skin', args: 'disco' } as never)) as unknown).toMatchObject({ text: expect.stringContaining('Unknown skin') })
  expect(saved.skin).toBe('pro')
  await ui.unmount()
})
