import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'session-band',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120 },
} as const

test('a session with no limit reading shows the last one any session saw, until that window resets', async ($, on) => {
  const inOneHour = new Date(Date.now() + 60 * 60_000).toISOString()
  const anHourAgo = new Date(Date.now() - 60 * 60_000).toISOString()
  const saved: Record<string, unknown> = {
    limits: [
      { kind: 'five_hour', percentUsed: 1, resetsAt: anHourAgo },
      { kind: 'seven_day', percentUsed: 57, resetsAt: inOneHour },
    ],
  }
  let rateLimits: { kind: string; percentUsed: number; resetsAt?: string }[] = []
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('store.get', (_, e) => ({ value: saved[e.key] }))
  on('store.set', (_, e) => {
    saved[e.key] = e.value
    return { value: undefined }
  })
  on('session.cwd', () => ({ value: '/Users/x/project' }))
  on('session.usage', () => ({ value: { startedAt: Date.now(), context: { tokens: 10_000, window: 1_000_000, percent: 1 }, rateLimits } }))
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('clock.every', () => ({ value: undefined }))
  on('session.measure', (_, e) => ({ changed: e.changed }))

  await $.session.start({ cwd: '/Users/x/project', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' } as never)
  const text = async (re: RegExp) => (await ui.find({ type: 'Text', text: re }))?.text ?? ''

  // The stored 7d reading is still in its window; the 5h one has reset, so it is unknown.
  expect(await text(/7D LIMIT/)).toBe('57% 7D LIMIT')
  expect(await text(/5H LIMIT/)).toBe('-- 5H LIMIT')
  await ui.unmount()

  // A fresh reading replaces what was stored, and is stored for other sessions.
  rateLimits = [{ kind: 'five_hour', percentUsed: 3, resetsAt: inOneHour }]
  await $.session.measure({ context: { tokens: 20_000, window: 1_000_000, percent: 2 }, rateLimits, changed: ['rateLimits'] } as never)
  const again = await $.ui.mount({ ...BAND, surface: 'desktop' } as never)
  expect((await again.find({ type: 'Text', text: /5H LIMIT/ }))?.text).toBe('3% 5H LIMIT')
  expect((await again.find({ type: 'Text', text: /7D LIMIT/ }))?.text).toBe('57% 7D LIMIT')
  expect(saved.limits).toEqual([
    { kind: 'five_hour', percentUsed: 3, resetsAt: inOneHour },
    { kind: 'seven_day', percentUsed: 57, resetsAt: inOneHour },
  ])
  await again.unmount()
})
