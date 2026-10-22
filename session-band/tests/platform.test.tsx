import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'session-band',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120 },
} as const

const ok = (stdout: string, exitCode = 0) => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
const PLAYING = JSON.stringify({ snapshot: { state: 'playing', track: { title: 'Divine', artist: '1000 Handz', station: 'EDM' }, index: 3, total: 15, volume: -21 } })

// One band for every system: the test plays the host the engine would be on.
for (const os of ['windows', 'macos'] as const) {
  test(`on ${os} the band finds cliamp, starts the radio in the background and writes the handoff under home`, async ($, on) => {
    const home = os === 'windows' ? 'C:\\Users\\ann' : '/Users/ann'
    const exe = os === 'windows' ? 'C:\\Users\\ann\\AppData\\Local\\Programs\\cliamp\\cliamp-windows-amd64\\cliamp.exe' : '/opt/homebrew/bin/cliamp'
    const files = new Set(os === 'windows' ? [exe] : ['/bin/sh', exe])
    const runs: string[][] = []
    let isRunning = false
    let copied = ''
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    on('command.register', (_, e) => ({ value: { command: e.name } }))
    on('store.get', () => ({ value: undefined }))
    on('store.set', () => ({ value: undefined }))
    on('session.cwd', () => ({ value: os === 'windows' ? 'C:\\work\\my-project' : '/work/my-project' }))
    on('session.usage', () => ({ value: { startedAt: Date.now(), context: { tokens: 10_000, window: 1_000_000, percent: 1 }, rateLimits: [] } }))
    // The engine resolves a path by the rules of the system the test runs on, where C:\ is not a
    // root, so a Windows path arrives under the working directory here.
    on('fs.exists', (_, e) => ({ value: [...files].some(f => e.path === f || e.path.endsWith(`/${f}`)) }))
    on('clock.every', () => ({ value: undefined }))
    on('clock.sleep', () => ({ value: undefined }))
    on('ui.copy', (_, e) => {
      copied = e.text
      return { value: { isCopied: true } }
    })
    on('ui.toast', () => ({ value: undefined }))
    on('prompt.submit', () => ({ drop: 'test' }))
    on('process.run', (_, e) => {
      runs.push([...e.argv])
      const [cmd, ...rest] = e.argv
      if (cmd === 'cmd.exe') return ok(`${home}\r\n`)
      if (cmd === '/bin/sh' && rest[1]?.startsWith('printf')) return ok(home)
      if (cmd === 'git') return ok('', 128)
      if (cmd === exe && rest[0] === 'remote') return isRunning ? ok(PLAYING) : ok('', 1)
      if (cmd === 'powershell.exe' || (cmd === '/bin/sh' && rest[1]?.startsWith('nohup'))) {
        isRunning = true
        return ok('')
      }
      return ok('', 1)
    })

    await $.session.start({ cwd: '/work', surface: 'desktop', isInteractive: true })
    const ui = await $.ui.mount({ ...BAND, surface: 'desktop' } as never)

    // Off until started, asked at the path the README installs to.
    expect((await ui.find({ type: 'Text', text: /OFFLINE/ }))?.text).toBe('OFFLINE')
    expect(runs.some(r => r[0] === exe && r[1] === 'remote')).toBe(true)

    await ui.press({ key: 'play' })
    const start = runs.find(r => r[0] === 'powershell.exe' || r.some(a => a.startsWith('nohup')))
    if (os === 'windows') {
      expect(start?.[4]).toBe(`Start-Process -WindowStyle Hidden -FilePath '${exe}' -ArgumentList '--daemon','--auto-play'`)
    } else {
      expect(start).toEqual(['/bin/sh', '-c', 'nohup "$0" --daemon --auto-play >/dev/null 2>&1 &', exe])
    }
    expect((await ui.find({ type: 'Text', text: /^EDM$/ }))?.text).toBe('EDM')

    await ui.press({ key: 'handoff' })
    const sep = os === 'windows' ? '\\' : '/'
    expect(copied).toContain(`Read ${home}${sep}.claude${sep}handoffs${sep}`)
    expect(runs.some(r => r[0] === '/usr/bin/printenv')).toBe(false)
    await ui.unmount()
  })
}
