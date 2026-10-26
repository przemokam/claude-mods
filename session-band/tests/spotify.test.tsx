import { expect, test } from 'claude-code/testing'
import type { MountTarget } from 'claude-code/testing'

const OK = { stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
const BAND = {
  plugin: 'session-band',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120 },
} as const

test('the band switches to Spotify, plays a listed genre or a pasted link, and searches the app for any other word', async ($, on) => {
  const store = new Map<string, unknown>()
  const runs: string[] = []
  let isSpotifyOpen = false
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
    const args = e.argv.join(' ')
    runs.push(args)
    if (e.argv[0] === '/bin/sh') return { value: { exitCode: 0, stdout: '/Users/ann\n', ...OK } }
    if (e.argv[0] === '/usr/bin/osascript') {
      if (args.includes('tell application "Spotify" to play')) isSpotifyOpen = true
      const stdout = args.includes('is not running then return "off"')
        ? isSpotifyOpen ? 'playing\t70\tDolly Parton\tJolene' : 'off'
        : ''
      return { value: { exitCode: 0, stdout, ...OK } }
    }
    if (e.argv[1] === 'remote' && e.argv[2] === 'state') {
      return { value: { exitCode: 0, stdout: JSON.stringify({ snapshot: { state: 'playing', track: { station: 'Lofi' }, total: 15, volume: -9 } }), ...OK } }
    }
    if (e.argv[1] === 'remote' && e.argv[2] === 'call') {
      return { value: { exitCode: 0, stdout: JSON.stringify({ job: { state: 'succeeded', result: { tracks: [] } } }), ...OK } }
    }
    return { value: { exitCode: 0, stdout: '', ...OK } }
  })
  on('clock.every', () => ({ value: undefined }))
  on('clock.sleep', () => ({ value: undefined }))
  on('fs.exists', (_, e) => ({ value: ['/bin/sh', '/usr/bin/osascript', '/Applications/Spotify.app'].includes(e.path) }))

  await $.session.start({ cwd: '/Users/ann/my-project', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' } as unknown as MountTarget<'terminal', 'AbovePrompt'>)

  // In cliamp's mode the search field and the list ask the station directory.
  await ui.input({ key: 'genre-search', text: 'country' })
  expect(runs.some(r => r.includes('provider.search') && r.includes('"query":"country"'))).toBe(true)

  await ui.press({ key: 'source' })
  // No cliamp under the test's paths, so the bare name from PATH.
  expect(runs).toContain('cliamp pause')
  expect(store.get('source')).toBe('spotify')
  expect((await ui.find({ type: 'Text', text: /^SPOTIFY$/ }))?.text).toBe('SPOTIFY')
  expect((await ui.find({ type: 'Text', text: /Jolene/ }))?.text).toBe('Dolly Parton - Jolene')
  expect((await ui.find({ type: 'Text', text: /70%/ }))?.text).toBe('● ON AIR · 70%')

  await ui.select({ key: 'genre-list', value: 'jazz' })
  expect(runs.some(r => r.includes('play track "spotify:playlist:37i9dQZF1DXbITWG1ZJKYt"'))).toBe(true)
  expect(store.get('spotifyGenre')).toBe('jazz')

  await ui.input({ key: 'genre-search', text: 'https://open.spotify.com/album/4LH4d3cOWNNsVw41Gqt2kv?si=x' })
  expect(runs.some(r => r.includes('play track "spotify:album:4LH4d3cOWNNsVw41Gqt2kv"'))).toBe(true)

  await ui.input({ key: 'genre-search', text: 'polka' })
  expect(runs).toContain('/usr/bin/open spotify:search:polka')

  await ui.press({ key: 'quieter' })
  expect(runs.some(r => r.includes('set sound volume to 60'))).toBe(true)
  await ui.unmount()
})
