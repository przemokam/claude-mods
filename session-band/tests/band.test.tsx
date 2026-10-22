import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'session-band',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120 },
} as const

test('the band shows the project, the context, both limits and the radio as separate elements', async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'rec' } }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('session.cwd', () => ({ value: '/Users/x/my-project/.claude/worktrees/new-session' }))
  on('session.usage', () => ({
    value: {
      startedAt: Date.now() - 95 * 60_000,
      context: { tokens: 604_000, window: 1_000_000, percent: 60 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 3, resetsAt: new Date(Date.now() + 31 * 60_000).toISOString() },
        { kind: 'seven_day', percentUsed: 38 },
      ],
      cost: { usd: 1381.17 },
    },
  }))
  on('process.run', (_, e) => {
    const args = e.argv.join(' ')
    if (args.includes('--git-common-dir')) return { value: { exitCode: 0, stdout: '/Users/x/my-project/.git\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    if (args.startsWith('/usr/bin/printenv')) return { value: { exitCode: 0, stdout: '/Users/x\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    if (args.includes('--abbrev-ref')) return { value: { exitCode: 0, stdout: 'feat/new-band\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    return {
      value: {
        exitCode: 0,
        stdout: JSON.stringify({
          snapshot: {
            state: 'playing',
            track: { title: 'Synthrain', artist: 'Dirk Dehler', station: 'Synthwave' },
            logical_track: { title: 'Synthwave' },
            index: 2,
            total: 15,
            volume: -9,
          },
        }),
        stderr: '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }
  })
  on('clock.every', () => ({ value: undefined }))

  await $.session.start({ cwd: '/Users/x/my-project', surface: 'desktop', isInteractive: true })

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface } as never)
    const text = async (re: RegExp) => (await ui.find({ type: 'Text', text: re }))?.text ?? ''
    expect(await text(/^MY-PROJECT$/)).toBe('MY-PROJECT')
    expect(await text(/⎇/)).toBe('⎇ feat/new-band')
    expect(await text(/^\$/)).toBe('$1381.17')
    expect(await text(/CTX/)).toBe('121% CTX 604K/500K')
    expect(await text(/5H LIMIT/)).toBe('3% 5H LIMIT')
    expect(await text(/resets in 31 min/)).toMatch(/^resets in 31 min · (today|tomorrow) \d\d:\d\d$/)
    expect(await text(/NEON FM/)).toBe(' NEON FM ')
    expect(await text(/^SYNTHWAVE$/)).toBe('SYNTHWAVE')
    expect(await text(/Synthrain/)).toBe('Dirk Dehler - Synthrain')
    expect(await text(/CH 03\/15/)).toBe('● ON AIR · CH 03/15 · -9 dB')
    for (const key of ['rec', 'handoff', 'prev', 'play', 'next', 'quieter', 'louder']) {
      expect(await ui.find({ key })).toBeDefined()
    }
    if (surface === 'desktop') expect(await ui.find({ type: 'Svg' })).toBeDefined()
    await ui.unmount()
  }
})
