import { expect, test } from 'claude-code/testing'

import { MASK, redactDeep, redactor } from '../hooks/rec'

const redact = redactor(['ann', 'Doe'])

test('rec mode hides personal data and secrets, and leaves ordinary text alone', async () => {
  const cases: Array<[string, string]> = [
    ['mail ann.doe@example.com now', `mail ${MASK} now`],
    ['host 203.0.113.10:5432', `host ${MASK}:5432`],
    ['v6 2001:db8:85a3:0:0:8a2e:370:7334', `v6 ${MASK}`],
    ['postgres://admin:s3cr3tPass@db-host:5432/app', `postgres://${MASK}@db-host:5432/app`],
    ['key sk-ant-api03-abcdefghijklmnopqrstuv', `key ${MASK}`],
    ['gh ghp_abcdefghijklmnopqrstuvwxyz0123', `gh ${MASK}`],
    // Built from parts, so a secret scanner does not take the fake key for a real one.
    [`aws ${'AKIA' + 'ABCDEFGHIJKLMNOP'}`, `aws ${MASK}`],
    [`do dop_v1_${'a'.repeat(64)}`, `do ${MASK}`],
    ['jwt eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.SflKxwRJSMeKKF2QT4', `jwt ${MASK}`],
    ['Authorization: Bearer abcdefghijklmnop1234', `Authorization: Bearer ${MASK}`],
    ['DB_PASSWORD=hunter2hunter', `DB_PASSWORD=${MASK}`],
    ['api_key: "xyz123abc"', `api_key: "${MASK}"`],
    ['/Users/ann/my-project', `/Users/${MASK}/my-project`],
    ['Jane Doe', `Jane ${MASK}`],
  ]
  for (const [input, output] of cases) expect(redact(input)).toBe(output)

  const kept = [
    'commit 5f1c2d3e4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d',
    'reset 22:15:30 today',
    'version 2.1.304 and 10.0',
    'annual but not the user',
  ]
  for (const text of kept) expect(redact(text)).toBe(text)

  expect(redactDeep({ command: 'psql postgres://a:b@h/db', n: 3, list: ['x@y.io'] }, redact)).toEqual({
    command: `psql postgres://${MASK}@h/db`,
    n: 3,
    list: [MASK],
  })
})

test('the REC button masks a reply on screen; turning it off shows it again', async ($, on) => {
  const store = new Map<string, unknown>()
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => {
    store.set(e.key, e.value)
    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'rec' } }))
  on('session.cwd', () => ({ value: '/Users/ann/my-project' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1_000_000 }, rateLimits: [] } }))
  on('process.run', (_, e) =>
    e.argv[0] === '/bin/sh'
      ? { value: { exitCode: 0, stdout: '/Users/ann\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
      : { value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } },
  )
  on('clock.every', () => ({ value: undefined }))
  on('fs.exists', (_, e) => ({ value: e.path === '/bin/sh' }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{(e.props as { text?: string }).text ?? ''}</Text>
  })

  await $.session.start({ cwd: '/Users/ann/my-project', surface: 'desktop', isInteractive: true })
  const reply = {
    plugin: 'session-band',
    component: 'AssistantMessage',
    props: { text: 'Logged in as ann.doe@example.com from 10.0.0.7', isFirstOfReply: true },
  } as const
  const band = {
    plugin: 'session-band',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120 },
  } as const

  for (const surface of ['desktop', 'terminal'] as const) {
    const before = await $.ui.mount({ ...reply, surface } as never)
    expect((await before.find({ type: 'Text', text: /Logged/ }))?.text).toBe('Logged in as ann.doe@example.com from 10.0.0.7')
    await before.unmount()

    const ui = await $.ui.mount({ ...band, surface } as never)
    await ui.press({ key: 'rec' })
    await ui.unmount()
    const during = await $.ui.mount({ ...reply, surface } as never)
    expect((await during.find({ type: 'Text', text: /Logged/ }))?.text).toBe(`Logged in as ${MASK} from ${MASK}`)
    await during.unmount()
    expect(store.get('rec')).toBe(true)

    const again = await $.ui.mount({ ...band, surface } as never)
    await again.press({ key: 'rec' })
    await again.unmount()
    expect(store.get('rec')).toBe(false)
  }
})
