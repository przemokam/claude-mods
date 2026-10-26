import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, InputProps, Register, RenderSurface, SelectProps } from 'claude-code'

import type { Limit, Radio, SkinName, Source } from '../types'
import { cased, contextBar, equalizer, nextSkin, ring, SKIN_ORDER, SKINS, VOLUME_MAX, VOLUME_MIN, volumeBar } from './hud'
import type { Tone } from './hud'
import { MASK, redactDeep, redactor } from './rec'

const OFF: Radio = { source: 'cliamp', volumePercent: null, isRunning: false, state: 'stopped', station: null, track: null, index: null, total: null, volumeDb: 0 }

const meter = atom({ plugin: 'session-band', key: 'meter' } as const, null)
const place = atom({ plugin: 'session-band', key: 'place' } as const, null)
const radio = atom({ plugin: 'session-band', key: 'radio' } as const, OFF)
const genre = atom({ plugin: 'session-band', key: 'genre' } as const, null)
const source = atom({ plugin: 'session-band', key: 'source' } as const, 'cliamp')
const now = atom({ plugin: 'session-band', key: 'now' } as const, 0)
const lastTurnAt = atom({ plugin: 'session-band', key: 'lastTurnAt' } as const, 0)
const rec = atom({ plugin: 'session-band', key: 'rec' } as const, false)
const recWords = atom({ plugin: 'session-band', key: 'recWords' } as const, [])
const user = atom({ plugin: 'session-band', key: 'user' } as const, null)
const skin = atom({ plugin: 'session-band', key: 'skin' } as const, 'neon')

// Where cliamp usually lands. A mod's child process does not get a login shell's PATH (the macOS
// app's has no Homebrew), and on Windows the desktop app keeps the Path it started with, so a
// folder the README's install adds is checked directly; the bare name, from PATH, comes last.
const UNIX_CLIAMP = ['/opt/homebrew/bin/cliamp', '/usr/local/bin/cliamp', '~/.local/bin/cliamp', '~/go/bin/cliamp']
const WINDOWS_CLIAMP = ['~\\AppData\\Local\\Programs\\cliamp\\cliamp-windows-amd64\\cliamp.exe', '~\\go\\bin\\cliamp.exe']
// autoCompactWindow in ~/.claude/settings.json (set 2026-10-21); keep the two in step.
const COMPACT_AT = 500_000
const WARN_AT = 300_000
const ALARM_AT = 450_000
const VOLUME_STEP = 3
// Claude Code's prompt cache on a subscription lives an hour after the last request; past it the
// next turn sends the whole context again (code.claude.com/docs/en/costs).
const CACHE_TTL_MS = 60 * 60_000
// The genre button steps through these and back to cliamp's own channels; /genre takes any word
// (/radio is a built-in command, so the engine refuses that name).
// Stations come from cliamp's Radio Browser provider (radio-browser.info), no account needed.
const GENRES = [
  'lofi', 'chillout', 'ambient', 'jazz', 'blues', 'classical', 'soul', 'funk', 'rock', 'classic rock', 'metal', 'punk',
  'indie', 'pop', '80s', '90s', 'hip hop', 'reggae', 'latin', 'house', 'techno', 'trance', 'drum and bass', 'synthwave',
  'country', 'folk',
]
const CLIAMP_CHANNELS = 'https://radio.cliamp.stream/streams.m3u'
// One local cliamp playlist, rewritten on each pick, so picks do not pile up as files.
const GENRE_PLAYLIST = 'session-band genre'
// cliamp skipped an Opus (OGG) stream when tried on 2026-10-26; MP3 and AAC played.
const PLAYABLE = new Set(['MP3', 'AAC', 'AAC+'])
const STATIONS_PER_GENRE = 20
// The Spotify app on macOS, driven by AppleScript: no developer account, the app's own login.
// AppleScript cannot search, so a genre is a playlist; each title was read from its
// open.spotify.com page on 2026-10-26 (all Spotify's own but "soul & funk", by Digster).
const SPOTIFY_GENRES: [name: string, playlist: string][] = [
  ['lofi', '37i9dQZF1DWWQRwui0ExPn'], // lofi beats
  ['piano', '37i9dQZF1DX4sWSpwq3LiO'], // Peaceful Piano
  ['jazz', '37i9dQZF1DXbITWG1ZJKYt'], // Jazz Classics
  ['jazz vibes', '37i9dQZF1DX0SM0LYsmbMT'], // Jazz Vibes
  ['blues', '37i9dQZF1DXd9rSDyQguIk'], // Blues Classics
  ['soul & funk', '53piQaZBey1bh4T2WY9doa'], // Soul Classics / Funk & Soul Essentials
  ['classical', '37i9dQZF1DWWEJlAGA9gs0'], // Classical Essentials
  ['rock', '37i9dQZF1DWXRqgorJj26U'], // Rock Classics
  ['metal', '37i9dQZF1DWWOaP4H0w5b0'], // Metal Essentials
  ['80s', '37i9dQZF1DX4UtSsGT1Sbe'], // All Out 80s
  ['90s', '37i9dQZF1DXbTxeAdrVG2l'], // All Out 90s
  ['2000s', '37i9dQZF1DX4o1oenSJRJd'], // All Out 2000s
  ['2010s', '37i9dQZF1DX5Ejj0EkURtP'], // All Out 2010s
  ['top hits', '37i9dQZF1DXcBWIGoYBM5M'], // Today's Top Hits
  ['hip hop', '37i9dQZF1DX0XUsuxWHRQd'], // RapCaviar
  ['rnb', '37i9dQZF1DX4SBhb3fqCJd'], // RNB X
  ['indie', '37i9dQZF1DX2Nc3B70tvx0'], // Indie's Top 50
  ['k-pop', '37i9dQZF1DX9tPFwDMOaN1'], // K-Pop ON!
  ['latin', '37i9dQZF1DX10zKzsJ2jva'], // Viva Latino
  ['country', '37i9dQZF1DX1lVhptIYRda'], // Hot Country
  ['dance', '37i9dQZF1DX8tZsk68tuDw'], // Dance Rising
  ['house', '37i9dQZF1DXa8NOEUWPn9W'], // Housewerk
  ['techno', '37i9dQZF1DX6J5NfMJS675'], // Techno Bunker
  ['trance', '37i9dQZF1DX91oIci4su1D'], // trance mission
  ['ambient', '37i9dQZF1DX3Ogo9pFvBkY'], // Ambient Relaxation
  ['focus', '37i9dQZF1DWXLeA8Omikj7'], // Brain Food
]
const SPOTIFY_LINK = /(?:open\.spotify\.com\/(?:intl-[a-z]+\/)?|spotify:)(playlist|album|artist|track)[/:]([A-Za-z0-9]+)/
const SPOTIFY_VOLUME_STEP = 10
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const pad = (n: number) => String(n).padStart(2, '0')

function span(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ${minutes % 60} min`
  return `${Math.floor(hours / 24)} d ${hours % 24} h`
}

function countdown(resetsAt: string | undefined, nowMs: number): string {
  return resetsAt === undefined ? '--' : span(Math.max(0, Math.round((Date.parse(resetsAt) - nowMs) / 60_000)))
}

function resetAt(resetsAt: string | undefined, nowMs: number): string {
  if (resetsAt === undefined) return '--'
  const d = new Date(Date.parse(resetsAt))
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (d.toDateString() === new Date(nowMs).toDateString()) return `today ${time}`
  if (d.toDateString() === new Date(nowMs + 86_400_000).toDateString()) return `tomorrow ${time}`
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${time}`
}

function limitTone(percent: number): Tone {
  return percent >= 80 ? 'alarm' : percent >= 50 ? 'warn' : 'ok'
}

function stamp(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
}

const isLimit = (x: unknown): x is Limit =>
  typeof x === 'object' && x !== null && typeof (x as Limit).kind === 'string' && typeof (x as Limit).percentUsed === 'number'

// The 5h and 7d windows belong to the account, and the engine has them only from a response that
// carried them (SessionUsage.rateLimits: "empty when none has a reading"). So an empty reading keeps
// the last one any session saw, from $.store, until that window resets.
async function accountLimits($: Engine, fresh: Limit[]): Promise<Limit[]> {
  const nowMs = Date.now()
  const stored = await $.store.get('limits')
  const kept = (Array.isArray(stored) ? stored : [])
    .filter(isLimit)
    .filter(l => l.resetsAt !== undefined && Date.parse(l.resetsAt) > nowMs && !fresh.some(f => f.kind === l.kind))
  const limits = [...fresh, ...kept]
  if (fresh.length > 0) await $.store.set('limits', limits)
  return limits
}

async function measure($: Engine) {
  const usage = await $.session.usage()
  const limits = await accountLimits(
    $,
    usage.rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })),
  )
  await update($, meter, () => ({
    tokens: usage.context.tokens ?? null,
    window: usage.context.window,
    limits,
    costUsd: usage.cost?.usd ?? null,
  }))
  await update($, now, () => Date.now())
}

async function locate($: Engine) {
  const cwd = await $.session.cwd()
  const run = (args: string[]) => $.process.run(['git', '-C', cwd, ...args], { timeoutMs: 5000 })
  // The repository's own folder, also from a worktree (its common dir is <repo>/.git).
  const common = await run(['rev-parse', '--path-format=absolute', '--git-common-dir'])
  const folder = common.exitCode === 0 ? common.stdout.trim().replace(/\/\.git\/?$/, '') : cwd
  const project = folder.split('/').filter(Boolean).pop() ?? folder
  const head = await run(['rev-parse', '--abbrev-ref', 'HEAD'])
  const branch = head.exitCode === 0 ? head.stdout.trim() : null
  const current = await read($, place)
  if (current?.project !== project || current.branch !== branch) {
    await update($, place, () => ({ project, branch }))
  }
}

// cliamp's `remote state` snapshot (v2.3.0): `track` carries the song (title, artist,
// station), `logical_track` the channel, plus `index`, `total` and `volume` in dB.
async function readRadio($: Engine) {
  const next = (await read($, source)) === 'spotify' ? await readSpotify($) : await readCliamp($)
  const current = await read($, radio)
  if (JSON.stringify(current) !== JSON.stringify(next)) {
    await update($, radio, () => next)
  }
}

async function readCliamp($: Engine): Promise<Radio> {
  try {
    const r = await $.process.run([(await getHost($)).cliamp, 'remote', 'state'], { timeoutMs: 5000 })
    if (r.exitCode === 0) {
      const s = JSON.parse(r.stdout).snapshot ?? {}
      const song = s.track?.artist && s.track?.title ? `${s.track.artist} - ${s.track.title}` : (s.track?.stream_title ?? null)
      return {
        ...OFF,
        isRunning: true,
        state: String(s.state ?? 'stopped'),
        station: s.track?.station ?? s.logical_track?.title ?? null,
        track: song,
        // cliamp leaves `index` out of the snapshot when it is 0.
        index: typeof s.index === 'number' ? s.index : typeof s.total === 'number' ? 0 : null,
        total: typeof s.total === 'number' ? s.total : null,
        volumeDb: typeof s.volume === 'number' ? s.volume : 0,
      }
    }
  } catch {
    // cliamp missing or its answer unreadable: the player shows as off.
  }
  return OFF
}

// The `is running` check comes first, so reading the state never opens the app.
const SPOTIFY_STATE = [
  'if application "Spotify" is not running then return "off"',
  'tell application "Spotify"',
  'if player state is stopped then return "stopped"',
  'return (player state as string) & tab & (sound volume as string) & tab & (artist of current track) & tab & (name of current track)',
  'end tell',
]

async function spotify($: Engine, lines: string[]): Promise<string | null> {
  const argv = ['/usr/bin/osascript', ...lines.flatMap(line => ['-e', line])]
  const r = await $.process.run(argv, { timeoutMs: 10_000 }).catch(() => null)
  return r?.exitCode === 0 ? r.stdout.trim() : null
}

async function readSpotify($: Engine): Promise<Radio> {
  const off: Radio = { ...OFF, source: 'spotify' }
  const out = await spotify($, SPOTIFY_STATE)
  if (out === null || out === 'off') return off
  if (out === 'stopped') return { ...off, isRunning: true, station: 'Spotify' }
  const [state = 'paused', volume = '0', artist = '', name = ''] = out.split('\t')
  return {
    ...off,
    isRunning: true,
    state,
    station: 'Spotify',
    track: artist === '' ? name : `${artist} - ${name}`,
    volumePercent: Number(volume) || 0,
  }
}

type Host = { os: 'unix' | 'windows'; home: string; cliamp: string; hasSpotify: boolean }

// No API names the system: /bin/sh is there on macOS and Linux and never on Windows, where cmd.exe
// gives the home folder. Read once per load; cliamp's path again when the radio is started.
let host: Host | null = null

async function detectHost($: Engine): Promise<Host> {
  const os = (await $.fs.exists('/bin/sh')) ? 'unix' : 'windows'
  const argv = os === 'unix' ? ['/bin/sh', '-c', 'printf %s "$HOME"'] : ['cmd.exe', '/d', '/c', 'echo %USERPROFILE%']
  const home = await $.process.run(argv, { timeoutMs: 5000 }).then(r => (r.exitCode === 0 ? r.stdout.trim() : ''), () => '')
  // Spotify is offered where AppleScript can drive its app: macOS with the app installed.
  const hasSpotify = (await $.fs.exists('/usr/bin/osascript')) && (await $.fs.exists('/Applications/Spotify.app'))
  return { os, home, cliamp: await findCliamp($, os, home), hasSpotify }
}

async function findCliamp($: Engine, os: Host['os'], home: string): Promise<string> {
  for (const candidate of os === 'unix' ? UNIX_CLIAMP : WINDOWS_CLIAMP) {
    if (candidate.startsWith('~') && home === '') continue
    const path = candidate.replace(/^~/, home)
    if (await $.fs.exists(path)) return path
  }
  return os === 'unix' ? 'cliamp' : 'cliamp.exe'
}

async function getHost($: Engine): Promise<Host> {
  host ??= await detectHost($)
  return host
}

async function cliamp($: Engine, args: string[], settleMs: number) {
  await $.process.run([(await getHost($)).cliamp, ...args], { timeoutMs: 5000 }).catch(() => undefined)
  await $.clock.sleep(settleMs)
  await readRadio($)
}

async function spotifyDo($: Engine, command: string, settleMs: number) {
  // `tell` opens the app when it is closed, which is what ▶ means.
  await spotify($, [`tell application "Spotify" to ${command}`])
  await $.clock.sleep(settleMs)
  await readRadio($)
}

async function skip($: Engine, direction: 'prev' | 'next') {
  if ((await read($, source)) === 'spotify') await spotifyDo($, direction === 'next' ? 'next track' : 'previous track', 500)
  else await cliamp($, [direction], 800)
}

async function playOrPause($: Engine) {
  const current = await read($, radio)
  if (current.source === 'spotify') {
    await spotifyDo($, 'playpause', 500)
    return
  }
  if (current.isRunning) {
    await cliamp($, ['toggle'], 300)
    return
  }
  await startDaemon($)
}

async function startDaemon($: Engine) {
  // Detached, so the music outlives a mod reload and the session; cliamp may have been installed
  // since the band loaded, so it is looked for again.
  const h = await getHost($)
  h.cliamp = await findCliamp($, h.os, h.home)
  // The path goes to sh as $0 and to PowerShell in single quotes (a quote inside doubled), so a
  // space or quote in it is not read as syntax.
  const argv =
    h.os === 'unix'
      ? ['/bin/sh', '-c', 'nohup "$0" --daemon --auto-play >/dev/null 2>&1 &', h.cliamp]
      : [
          'powershell.exe',
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `Start-Process -WindowStyle Hidden -FilePath '${h.cliamp.replaceAll("'", "''")}' -ArgumentList '--daemon','--auto-play'`,
        ]
  await $.process.run(argv, { timeoutMs: 10_000 }).catch(() => undefined)
  await $.clock.sleep(1500)
  await readRadio($)
}

// A v2 IPC operation's result, or null when cliamp is not running or the job failed.
async function remote($: Engine, operation: string, params: object): Promise<Record<string, unknown> | null> {
  const argv = [(await getHost($)).cliamp, 'remote', 'call', operation, '--params', JSON.stringify(params), '--wait']
  try {
    const r = await $.process.run(argv, { timeoutMs: 20_000 })
    const job = r.exitCode === 0 ? JSON.parse(r.stdout).job : null
    return job?.state === 'succeeded' ? (job.result ?? {}) : null
  } catch {
    return null
  }
}

type Station = { title: string; path: string; provider_meta?: Record<string, string> }

// Each source keeps its own last pick in $.store.
const genreKey = (s: Source) => (s === 'spotify' ? 'spotifyGenre' : 'genre')

async function setGenre($: Engine, name: string | null) {
  await update($, genre, () => name)
  await $.store.set(genreKey(await read($, source)), name)
}

async function setSource($: Engine, next: Source) {
  await update($, source, () => next)
  await $.store.set('source', next)
  const stored = await $.store.get(genreKey(next))
  await update($, genre, () => (typeof stored === 'string' ? stored : null))
}

// Switching pauses the player left behind and starts the other one.
async function switchSource($: Engine): Promise<string> {
  const from = await read($, source)
  const to: Source = from === 'spotify' ? 'cliamp' : 'spotify'
  const playing = await read($, radio)
  if (from === 'cliamp' && playing.isRunning && playing.state === 'playing') await cliamp($, ['pause'], 0)
  if (from === 'spotify') await spotify($, ['if application "Spotify" is running then tell application "Spotify" to pause'])
  await setSource($, to)
  if (to === 'spotify') await spotifyDo($, 'play', 800)
  else if ((await readCliamp($)).isRunning) await cliamp($, ['play'], 500)
  else await startDaemon($)
  return to === 'spotify' ? 'Source: Spotify' : 'Source: cliamp radio'
}

async function tuneSpotify($: Engine, uri: string, label: string): Promise<string> {
  if ((await read($, source)) !== 'spotify') await switchSource($)
  // The URI is built from SPOTIFY_GENRES or SPOTIFY_LINK's letters and digits, never raw text.
  await spotifyDo($, `play track "${uri}"`, 1200)
  await setGenre($, label)
  return `Spotify: ${label}. ⏮ ⏭ switch tracks.`
}

// AppleScript cannot search Spotify, so a word that is no listed genre opens the app's search.
async function spotifySearch($: Engine, word: string): Promise<string> {
  await $.process.run(['/usr/bin/open', `spotify:search:${encodeURIComponent(word)}`], { timeoutMs: 10_000 }).catch(() => undefined)
  return `"${word}" is not on the band's Spotify list; its search is open in the Spotify app.`
}

// Searches Radio Browser through cliamp for the word, writes the stations into one local playlist
// and loads it, so ⏮ ⏭ step through that genre's stations with their names.
async function tuneGenre($: Engine, word: string): Promise<string> {
  if (!(await read($, radio)).isRunning) await startDaemon($)
  // radio-browser.info resets a connection now and then (seen 2026-10-26); a second try got through.
  const search = () => remote($, 'provider.search', { provider: 'radio', query: word, limit: 60 })
  const found = (await search()) ?? (await search())
  const seen = new Set<string>()
  const stations = ((found?.tracks ?? []) as Station[])
    .filter(t => PLAYABLE.has(String(t.provider_meta?.['radio.codec'] ?? '').toUpperCase()))
    .filter(t => !seen.has(t.title.toLowerCase()) && seen.add(t.title.toLowerCase()))
    .slice(0, STATIONS_PER_GENRE)
    .map(t => ({ title: t.title, path: t.path, stream: true }))
  if (stations.length === 0) return found === null ? 'The station directory did not answer; try again in a moment.' : `No stations found for "${word}".`
  await remote($, 'playlist.create', { provider: 'local', playlist: GENRE_PLAYLIST })
  const isSaved = await remote($, 'playlist.replace', { provider: 'local', playlist: GENRE_PLAYLIST, tracks: stations })
  if (isSaved === null || (await remote($, 'load', { playlist: GENRE_PLAYLIST })) === null) return `Could not load the "${word}" stations.`
  await remote($, 'play', {})
  await setGenre($, word)
  await $.clock.sleep(1500)
  await readRadio($)
  return `${word}: ${stations.length} stations. ⏮ ⏭ switch between them.`
}

async function tuneCliamp($: Engine): Promise<string> {
  if (!(await read($, radio)).isRunning) await startDaemon($)
  await remote($, 'queue.clear', {})
  if ((await remote($, 'url.load', { path: CLIAMP_CHANNELS, play: true })) === null) return 'Could not load the cliamp channels.'
  await setGenre($, null)
  await $.clock.sleep(1500)
  await readRadio($)
  return 'Back to the cliamp channels.'
}

// cliamp: its channels, then each genre in turn, then cliamp again. Spotify: its list, round.
async function nextGenre($: Engine): Promise<string> {
  const current = await read($, genre)
  if ((await read($, source)) === 'spotify') {
    const at = SPOTIFY_GENRES.findIndex(([name]) => name === current)
    const [name, id] = SPOTIFY_GENRES[(at + 1) % SPOTIFY_GENRES.length] ?? SPOTIFY_GENRES[0]!
    return tuneSpotify($, `spotify:playlist:${id}`, name)
  }
  const at = current === null ? -1 : GENRES.indexOf(current)
  const following = GENRES[at + 1]
  return following === undefined ? tuneCliamp($) : tuneGenre($, following)
}

// One door for /genre, the genre list and the search field: a word means the current source's
// genre, a Spotify link plays in Spotify from either source.
async function pickGenre($: Engine, text: string): Promise<string> {
  const link = SPOTIFY_LINK.exec(text)
  if (link !== null && host?.hasSpotify) return tuneSpotify($, `spotify:${link[1]}:${link[2]}`, link[1] ?? 'link')
  const word = text.trim().toLowerCase()
  if (word === '') return 'Type a genre, for example country.'
  if (word === 'next') return nextGenre($)
  // From Spotify, `cliamp` returns to whatever cliamp was playing; in cliamp, to its own channels.
  if (word === 'cliamp') return (await read($, source)) === 'spotify' ? switchSource($) : tuneCliamp($)
  if (word === 'spotify' && host?.hasSpotify) {
    return (await read($, source)) === 'spotify' ? 'Source: Spotify' : switchSource($)
  }
  if ((await read($, source)) === 'spotify') {
    const listed = SPOTIFY_GENRES.find(([name]) => name === word)
    return listed === undefined ? spotifySearch($, word) : tuneSpotify($, `spotify:playlist:${listed[1]}`, listed[0])
  }
  return tuneGenre($, word)
}

async function runGenre($: Engine, args: string): Promise<string> {
  const word = args.trim().toLowerCase()
  if (word === '' || word === 'list') {
    const names = (await read($, source)) === 'spotify' ? SPOTIFY_GENRES.map(([name]) => name) : GENRES
    return `Genres: ${names.join(', ')}. Usage: /genre <genre> | /genre next | /genre cliamp | /genre spotify | /genre <Spotify link>`
  }
  return pickGenre($, args)
}

async function changeVolume($: Engine, direction: 1 | -1) {
  const current = await read($, radio)
  if (current.source === 'spotify') {
    const target = Math.max(0, Math.min(100, (current.volumePercent ?? 0) + direction * SPOTIFY_VOLUME_STEP))
    await spotifyDo($, `set sound volume to ${target}`, 200)
    return
  }
  const target = Math.max(VOLUME_MIN, Math.min(VOLUME_MAX, current.volumeDb + direction * VOLUME_STEP))
  await cliamp($, ['volume', String(target)], 200)
}

async function handoff($: Engine, surface: RenderSurface) {
  const { os, home } = await getHost($)
  const project = (await read($, place))?.project ?? 'session'
  const name = `${project}-${stamp(Date.now())}.md`
  const path = os === 'windows' ? `${home}\\.claude\\handoffs\\${name}` : `${home}/.claude/handoffs/${name}`
  const resume = `Read ${path} and continue the work from where the previous conversation stopped.`
  const copied = await $.ui.copy({ text: resume, surface })
  void $.prompt.submit({
    text:
      `Write a handoff note for a new conversation to ${path} (create the folder if it does not exist). ` +
      'Include: the goal and the current task, what is done (with branches, PRs and SHAs), what is in progress, ' +
      'the next steps in order, open questions and the user\'s decisions, important files and commands. ' +
      'Write it so a new conversation can start without this history. Finish with one sentence saying the file is saved.',
  })
  $.ui.toast(
    copied.isCopied
      ? 'The prompt for the new conversation is on the clipboard. Once Claude has saved the file, start a new conversation and paste it.'
      : `Could not copy. Paste this in a new conversation: ${resume}`,
  )
}

async function setRec($: Engine, isOn: boolean) {
  await update($, rec, () => isOn)
  await $.store.set('rec', isOn)
}

async function setRecWords($: Engine, words: string[]) {
  await update($, recWords, () => words)
  await $.store.set('recWords', words)
}

// The masking function for what is drawn now, or null while rec mode is off.
async function activeRedactor($: Engine): Promise<((text: string) => string) | null> {
  if (!(await read($, rec))) return null
  const name = await read($, user)
  return redactor([...(await read($, recWords)), ...(name === null ? [] : [name])])
}

// The skin lives in $.store, so a new session opens in the one chosen last.
async function setSkin($: Engine, name: SkinName) {
  await update($, skin, () => name)
  await $.store.set('skin', name)
}

const SKIN_NAMES: Record<string, SkinName> = { neon: 'neon', hacker: 'hacker', pro: 'pro', professional: 'pro', profesjonalna: 'pro' }

async function runSkin($: Engine, args: string): Promise<string> {
  const word = args.trim().toLowerCase()
  const list = SKIN_ORDER.map(n => SKINS[n].title).join(', ')
  if (word === 'list') return `Skins: ${list}. Current: ${SKINS[await read($, skin)].title}.`
  const name = word === '' ? nextSkin(await read($, skin)) : SKIN_NAMES[word]
  if (name === undefined) return `Unknown skin "${word}". Usage: /skin | /skin neon | /skin hacker | /skin pro | /skin list`
  await setSkin($, name)
  return `Skin: ${SKINS[name].title}`
}

async function runRec($: Engine, args: string): Promise<string> {
  const [verb = '', ...rest] = args.trim().split(/\s+/)
  const word = rest.join(' ').trim()
  const words = await read($, recWords)
  if (verb === '' || verb === 'toggle') {
    const isOn = !(await read($, rec))
    await setRec($, isOn)
    return isOn ? 'REC on: personal data and secrets are masked on screen.' : 'REC off.'
  }
  if (verb === 'on' || verb === 'off') {
    await setRec($, verb === 'on')
    return verb === 'on' ? 'REC on.' : 'REC off.'
  }
  if (verb === 'add' && word !== '') {
    await setRecWords($, [...words.filter(w => w.toLowerCase() !== word.toLowerCase()), word])
    return `Also masking: ${word}`
  }
  if (verb === 'remove' && word !== '') {
    await setRecWords($, words.filter(w => w.toLowerCase() !== word.toLowerCase()))
    return `No longer masking: ${word}`
  }
  if (verb === 'list') return words.length === 0 ? 'No custom words.' : `Custom words: ${words.join(', ')}`
  return 'Usage: /rec | /rec on | /rec off | /rec add <word> | /rec remove <word> | /rec list'
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({ name: 'skin', description: 'Band skin: neon, hacker or pro (no name: the next one)' })
    await $.command.register({ name: 'rec', description: 'Rec mode: masks personal data and secrets on screen (on, off, add, remove, list)' })
    await $.command.register({ name: 'genre', description: 'Music by genre: /genre jazz, /genre next, /genre cliamp, /genre list, /genre <Spotify link>' })
    const storedRec = await $.store.get('rec')
    const storedWords = await $.store.get('recWords')
    const storedSkin = await $.store.get('skin')
    await update($, skin, () => (typeof storedSkin === 'string' && storedSkin in SKINS ? (storedSkin as SkinName) : 'neon'))
    await update($, rec, () => storedRec === true)
    await update($, recWords, () => (Array.isArray(storedWords) ? storedWords.filter((w): w is string => typeof w === 'string') : []))
    host = await detectHost($)
    await update($, user, () => host?.home.split(/[\\/]/).filter(Boolean).pop() ?? null)
    const storedSource = await $.store.get('source')
    const startSource: Source = storedSource === 'spotify' && host.hasSpotify ? 'spotify' : 'cliamp'
    await update($, source, () => startSource)
    const storedGenre = await $.store.get(genreKey(startSource))
    await update($, genre, () => (typeof storedGenre === 'string' ? storedGenre : null))
    await Promise.all([measure($), locate($), readRadio($)])
    // A new song or station redraws the band; an unchanged player does not.
    $.clock.every(10_000, () => void readRadio($))
    // Minute resolution is enough for the reset countdowns; every redraw restarts the animations.
    $.clock.every(60_000, () => void update($, now, () => Date.now()))
    return result
  })

  on('session.measure', async ($, e, next) => {
    const result = await next(e)
    await measure($)
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    await update($, lastTurnAt, () => Date.now())
    await update($, now, () => Date.now())
    await locate($)
    return result
  })

  on('command.run', { command: 'rec' }, async ($, e) => ({ text: await runRec($, e.args) }))

  on('command.run', { command: 'skin' }, async ($, e) => ({ text: await runSkin($, e.args) }))

  on('command.run', { command: 'genre' }, async ($, e) => ({ text: await runGenre($, e.args) }))

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const redact = await activeRedactor($)
    return redact === null ? next(e) : next({ ...e, props: { ...e.props, text: redact(e.props.text) } })
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const redact = await activeRedactor($)
    return redact === null ? next(e) : next({ ...e, props: { ...e.props, text: redact(e.props.text) } })
  })

  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    const redact = await activeRedactor($)
    return redact === null ? next(e) : next({ ...e, props: { ...e.props, text: redact(e.props.text) } })
  })

  on('ui.render', { component: 'InfoNotice' }, async ($, e, next) => {
    const redact = await activeRedactor($)
    return redact === null ? next(e) : next({ ...e, props: { ...e.props, text: redact(e.props.text) } })
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const redact = await activeRedactor($)
    return redact === null ? next(e) : next({ ...e, props: { ...e.props, input: redactDeep(e.props.input, redact) } })
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const redact = await activeRedactor($)
    return redact === null ? next(e) : next({ ...e, props: { ...e.props, output: redactDeep(e.props.output, redact) } })
  })

  // A collapsed group's line is drawn from its calls' paths and patterns, which a rewrite cannot
  // reach, so while recording the group draws as a count.
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    if (!(await read($, rec)) || e.props.isExpanded) return next(e)
    const { Text } = $.ui.resolve(e)
    const n = e.props.calls.length
    return (
      <Text dimColor>
        {MASK.slice(0, 2)} {n} {n === 1 ? 'tool call' : 'tool calls'} (REC)
      </Text>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const m = await read($, meter)
    const p = await read($, place)
    const r = await read($, radio)
    const g = await read($, genre)
    const nowMs = await read($, now)
    const lastTurn = await read($, lastTurnAt)
    const isRec = await read($, rec)
    const k = SKINS[await read($, skin)]
    const w = k.words
    // The mobile app draws no Input or Select yet, so the genre list and search field drop out there.
    const { Box, Button, Input, Select, Svg, Text } = $.ui.resolve(e) as ReturnType<typeof $.ui.resolve> & {
      Svg?: (props: { source: string; alt: string; width?: number; height?: number; isInteractive?: boolean }) => JSX.Element
      Input?: (props: InputProps) => JSX.Element
      Select?: (props: SelectProps) => JSX.Element
    }
    // Pictures only where the surface draws SVG; elsewhere the text alone carries everything.
    const art = (source: string, alt: string, width: number, height: number) =>
      e.surface === 'desktop' && Svg ? <Svg source={source} alt={alt} width={width} height={height} isInteractive /> : null

    const tokens = m?.tokens ?? null
    const ctxTone: Tone = tokens === null ? 'idle' : tokens >= ALARM_AT ? 'alarm' : tokens >= WARN_AT ? 'warn' : 'ok'
    const ctxPercent = tokens === null ? null : (tokens / COMPACT_AT) * 100
    const limits = [
      { kind: 'five_hour', label: w.fiveHour, icon: 'clock' as const },
      { kind: 'seven_day', label: w.sevenDay, icon: 'calendar' as const },
    ].map(({ kind, label, icon }) => {
      const l = m?.limits.find(x => x.kind === kind)
      return { kind, label, icon, percent: l?.percentUsed ?? null, tone: l === undefined ? ('idle' as Tone) : limitTone(l.percentUsed), resetsAt: l?.resetsAt }
    })
    const isPlaying = r.isRunning && r.state === 'playing'
    const ctxText = tokens === null ? '--' : `${Math.round(tokens / 1000)}K/${COMPACT_AT / 1000}K`
    const isSpotify = r.source === 'spotify'
    // Spotify's 0-100 drawn on the same bar as cliamp's dB.
    const volumeLevelDb = r.volumePercent === null ? r.volumeDb : VOLUME_MIN + (r.volumePercent / 100) * (VOLUME_MAX - VOLUME_MIN)
    const listed = isSpotify ? SPOTIFY_GENRES.map(([name]) => name) : ['cliamp', ...GENRES]
    // A typed genre joins the list, so the picker can show it as the current one.
    const genreOptions = [...listed, ...(g !== null && !listed.includes(g) ? [g] : [])].map(value => ({
      value,
      label: value === 'cliamp' ? 'cliamp channels' : value,
    }))
    const channel = r.index === null || r.total === null ? `${w.channel} --` : `${w.channel} ${pad(r.index + 1)}/${pad(r.total)}`
    const cacheLeft = lastTurn === 0 ? null : Math.round((lastTurn + CACHE_TTL_MS - nowMs) / 60_000)
    const cacheTone: Tone = cacheLeft === null ? 'idle' : cacheLeft <= 0 ? 'alarm' : cacheLeft <= 15 ? 'warn' : 'ok'
    const isHandoffTime = tokens !== null && tokens >= WARN_AT

    return (
      <Box flexDirection="column" gap="sm" backgroundColor={k.panel} borderStyle="single" borderColor={k.border} paddingX="md" paddingY="sm">
        <Box flexDirection="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap="sm">
          <Box flexDirection="row" alignItems="center" flexWrap="wrap" gap="sm">
            {k.badge !== null && (
              <Text backgroundColor={k.badge.bg} color={k.badge.ink} weight="bold" mono size="caption">
                {k.badge.text}
              </Text>
            )}
            <Text color={k.accent} weight={k.mono ? 'bold' : 'semibold'} mono={k.mono} size="heading">
              {cased(k, p?.project ?? 'session')}
            </Text>
            {p?.branch != null && (
              <Text color={k.info} mono>
                ⎇ {p.branch}
              </Text>
            )}
            {m?.costUsd != null && (
              <Text color={k.accent} mono tabular weight="semibold">
                ${m.costUsd.toFixed(2)}
              </Text>
            )}
            {cacheLeft !== null && (
              <Text color={k.dim} mono={k.mono}>
                {w.cache} <Text color={k.tone[cacheTone]} mono tabular>{cacheLeft <= 0 ? w.cold : `${cacheLeft} min`}</Text>
              </Text>
            )}
          </Box>
          <Box flexDirection="row" alignItems="center" gap="xs">
            <Button key="skin" hotkey="s" label="Skin" onPress={() => setSkin($, nextSkin(k.name))}>
              <Text color={k.dim} mono={k.mono}>
                ◐ {k.title}
              </Text>
            </Button>
            <Button key="rec" hotkey="r" label="REC" onPress={() => setRec($, !isRec)}>
              <Text color={isRec ? k.rec : k.dim} weight="bold" mono={k.mono}>
                {isRec ? w.rec[0] : w.rec[1]}
              </Text>
            </Button>
            <Button key="handoff" hotkey="h" label="Start new conversation" onPress={() => handoff($, e.surface)}>
              <Text color={isHandoffTime ? k.tone.warn : k.dim} weight="bold" mono={k.mono}>
                {w.handoff}
              </Text>
            </Button>
          </Box>
        </Box>

        <Box flexDirection="row" alignItems="center" flexWrap="wrap" columnGap="lg" rowGap="sm">
          <Box key="ctx" flexDirection="row" alignItems="center" gap="sm">
            {art(ring(k, ctxPercent, ctxTone, 'chip'), 'Context', 46, 46)}
            <Box flexDirection="column">
              <Text>
                <Text color={k.tone[ctxTone]} weight={k.mono ? 'bold' : 'semibold'} mono tabular size="heading">
                  {ctxPercent === null ? '--' : `${Math.round(ctxPercent)}%`}
                </Text>
                <Text color={k.dim} mono={k.mono}>
                  {' '}
                  {w.ctx} <Text color={k.ink} mono tabular>{ctxText}</Text>
                </Text>
              </Text>
              {tokens !== null && m !== null && art(contextBar(k, tokens, m.window, COMPACT_AT, WARN_AT, ALARM_AT), 'Context buffer', 170, 14)}
            </Box>
          </Box>
          {limits.map(l => (
            <Box key={l.kind} flexDirection="row" alignItems="center" gap="sm">
              {art(ring(k, l.percent, l.tone, l.icon), `${l.label} limit`, 46, 46)}
              <Box flexDirection="column">
                <Text>
                  <Text color={k.tone[l.tone]} weight={k.mono ? 'bold' : 'semibold'} mono tabular size="heading">
                    {l.percent === null ? '--' : `${Math.round(l.percent)}%`}
                  </Text>
                  <Text color={k.dim} mono={k.mono}>
                    {' '}
                    {w.limit(l.label)}
                  </Text>
                </Text>
                <Text color={k.dim} mono={k.mono} size="footnote">
                  resets in <Text color={k.ink} mono={k.mono} tabular>{countdown(l.resetsAt, nowMs)}</Text> · <Text color={k.ink} mono={k.mono} tabular>{resetAt(l.resetsAt, nowMs)}</Text>
                </Text>
              </Box>
            </Box>
          ))}
        </Box>

        <Box key="radio" flexDirection="column" gap="xs" borderStyle="single" borderColor={k.radioBorder} paddingX="sm" paddingY="xs">
        <Box key="player" flexDirection="row" alignItems="center" flexWrap="wrap" gap="sm">
          {k.radioBadge.bg === null ? (
            <Text color={k.radioBadge.ink} weight="medium" mono={k.mono} size="caption">
              {k.radioBadge.text}
            </Text>
          ) : (
            <Text backgroundColor={k.radioBadge.bg} color={k.radioBadge.ink} weight="bold" mono size="caption">
              {k.radioBadge.text}
            </Text>
          )}
          <Text color={r.isRunning ? k.info : k.dim} weight={k.mono ? 'bold' : 'semibold'} mono={k.mono}>
            {r.isRunning ? cased(k, r.station ?? 'radio') : w.offline}
          </Text>
          <Text color={k.mono ? k.accent : k.ink} mono={k.mono} wrap="truncate-end">
            {r.track ?? (r.isRunning ? 'live stream' : 'press ▶ to tune in')}
          </Text>
          {r.isRunning && (
            <Text color={k.dim} mono={k.mono} size="footnote">
              {isPlaying ? <Text color={k.rec}>{w.onAir}</Text> : w.paused} · {r.volumePercent === null ? `${channel} · ${r.volumeDb > 0 ? '+' : ''}${r.volumeDb} dB` : `${r.volumePercent}%`}
            </Text>
          )}
          {r.isRunning && art(equalizer(k, isPlaying), 'Equalizer', 66, 24)}
          {r.isRunning && art(volumeBar(k, volumeLevelDb), 'Volume', 70, 14)}
          <Box flexDirection="row" gap="xs">
            <Button key="genre" hotkey="g" label="Next genre" onPress={async () => $.ui.toast(await nextGenre($))}>
              <Text color={k.info} mono={k.mono}>
                ♫ {cased(k, g ?? (isSpotify ? 'pick a genre' : 'cliamp'))}
              </Text>
            </Button>
            {r.isRunning && <Button key="prev" label="⏮" onPress={() => skip($, 'prev')} />}
            <Button key="play" label={isPlaying ? '❚❚' : '▶'} onPress={() => playOrPause($)} />
            {r.isRunning && <Button key="next" label="⏭" onPress={() => skip($, 'next')} />}
            {r.isRunning && <Button key="quieter" label="VOL −" onPress={() => changeVolume($, -1)} />}
            {r.isRunning && <Button key="louder" label="VOL +" onPress={() => changeVolume($, 1)} />}
          </Box>
        </Box>
        <Box key="browse" flexDirection="row" alignItems="center" flexWrap="wrap" gap="sm">
          {host?.hasSpotify && (
            <Button key="source" hotkey="m" label={`Switch to ${isSpotify ? 'cliamp radio' : 'Spotify'}`} onPress={async () => $.ui.toast(await switchSource($))}>
              <Text color={k.dim} mono={k.mono}>
                ⇄ {isSpotify ? 'cliamp' : 'Spotify'}
              </Text>
            </Button>
          )}
          {Select && (
            <Select key="genre-list" label="Genre" options={genreOptions} value={g ?? (isSpotify ? undefined : 'cliamp')} onSelect={async value => $.ui.toast(await pickGenre($, value))} />
          )}
          {Input && (
            <Input
              key="genre-search"
              placeholder={isSpotify ? 'genre or Spotify link' : 'type any genre, e.g. country'}
              submitLabel="tune in"
              onSubmit={async value => $.ui.toast(await pickGenre($, value))}
            />
          )}
        </Box>
        </Box>
      </Box>
    )
  })
}
