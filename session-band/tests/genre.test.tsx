import { expect, test } from 'claude-code/testing'

const OK = { stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
const job = (result: object) => JSON.stringify({ job: { state: 'succeeded', result } })
const station = (title: string, codec: string) => ({ title, path: `https://radio.example/${title}`, provider_meta: { 'radio.codec': codec } })

test('/genre jazz loads the playable jazz stations into one playlist and the band names the genre', async ($, on) => {
  const store = new Map<string, unknown>()
  const calls: { operation: string; params: Record<string, unknown> }[] = []
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => {
    store.set(e.key, e.value)
    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'genre' } }))
  on('session.cwd', () => ({ value: '/Users/ann/my-project' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1_000_000 }, rateLimits: [] } }))
  on('process.run', (_, e) => {
    if (e.argv[0] === '/bin/sh') return { value: { exitCode: 0, stdout: '/Users/ann\n', ...OK } }
    if (e.argv[1] === 'remote' && e.argv[2] === 'state') {
      // index 0 is left out of cliamp's snapshot.
      return { value: { exitCode: 0, stdout: JSON.stringify({ snapshot: { state: 'playing', track: { station: 'Jazz One' }, total: 2, volume: -9 } }), ...OK } }
    }
    if (e.argv[1] === 'remote' && e.argv[2] === 'call') {
      const operation = e.argv[3] ?? ''
      calls.push({ operation, params: JSON.parse(e.argv[5] ?? '{}') })
      const result =
        operation === 'provider.search'
          ? { tracks: [station('Jazz One', 'MP3'), station('Jazz Opus', 'OGG'), station('jazz one', 'MP3'), station('Jazz Two', 'AAC')] }
          : { ok: true }
      return { value: { exitCode: 0, stdout: job(result), ...OK } }
    }
    return { value: { exitCode: 1, stdout: '', ...OK } }
  })
  on('clock.every', () => ({ value: undefined }))
  on('clock.sleep', () => ({ value: undefined }))
  on('fs.exists', (_, e) => ({ value: e.path === '/bin/sh' }))

  await $.session.start({ cwd: '/Users/ann/my-project', surface: 'desktop', isInteractive: true })
  expect((await $.command.run({ command: 'genre', args: 'Jazz' } as never)) as unknown).toMatchObject({ text: 'jazz: 2 stations. ⏮ ⏭ switch between them.' })

  const replace = calls.find(c => c.operation === 'playlist.replace')
  expect((replace?.params.tracks as { title: string }[]).map(t => t.title)).toEqual(['Jazz One', 'Jazz Two'])
  expect(calls.map(c => c.operation)).toEqual(['provider.search', 'playlist.create', 'playlist.replace', 'load', 'play'])
  expect(store.get('genre')).toBe('jazz')

  const ui = await $.ui.mount({
    plugin: 'session-band',
    component: 'AbovePrompt',
    surface: 'terminal',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120 },
  } as never)
  expect((await ui.find({ type: 'Text', text: /♫/ }))?.text).toBe('♫ JAZZ')
  expect((await ui.find({ type: 'Text', text: /CH 01\/02/ }))?.text).toBe('● ON AIR · CH 01/02 · -9 dB')
  expect(await ui.find({ key: 'genre' })).toBeDefined()
  await ui.unmount()
})
