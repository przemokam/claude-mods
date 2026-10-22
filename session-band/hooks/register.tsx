import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, Register, RenderSurface } from 'claude-code'

import type { Limit, Radio, SkinName } from '../types'
import { cased, contextBar, equalizer, nextSkin, ring, SKIN_ORDER, SKINS, VOLUME_MAX, VOLUME_MIN, volumeBar } from './hud'
import type { Tone } from './hud'
import { MASK, redactDeep, redactor } from './rec'

const OFF: Radio = { isRunning: false, state: 'stopped', station: null, track: null, index: null, total: null, volumeDb: 0 }

const meter = atom({ plugin: 'session-band', key: 'meter' } as const, null)
const place = atom({ plugin: 'session-band', key: 'place' } as const, null)
const radio = atom({ plugin: 'session-band', key: 'radio' } as const, OFF)
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
  let next: Radio = OFF
  try {
    const r = await $.process.run([(await getHost($)).cliamp, 'remote', 'state'], { timeoutMs: 5000 })
    if (r.exitCode === 0) {
      const s = JSON.parse(r.stdout).snapshot ?? {}
      const song = s.track?.artist && s.track?.title ? `${s.track.artist} - ${s.track.title}` : (s.track?.stream_title ?? null)
      next = {
        isRunning: true,
        state: String(s.state ?? 'stopped'),
        station: s.track?.station ?? s.logical_track?.title ?? null,
        track: song,
        index: typeof s.index === 'number' ? s.index : null,
        total: typeof s.total === 'number' ? s.total : null,
        volumeDb: typeof s.volume === 'number' ? s.volume : 0,
      }
    }
  } catch {
    // cliamp missing or its answer unreadable: the player shows as off.
  }
  const current = await read($, radio)
  if (JSON.stringify(current) !== JSON.stringify(next)) {
    await update($, radio, () => next)
  }
}

type Host = { os: 'unix' | 'windows'; home: string; cliamp: string }

// No API names the system: /bin/sh is there on macOS and Linux and never on Windows, where cmd.exe
// gives the home folder. Read once per load; cliamp's path again when the radio is started.
let host: Host | null = null

async function detectHost($: Engine): Promise<Host> {
  const os = (await $.fs.exists('/bin/sh')) ? 'unix' : 'windows'
  const argv = os === 'unix' ? ['/bin/sh', '-c', 'printf %s "$HOME"'] : ['cmd.exe', '/d', '/c', 'echo %USERPROFILE%']
  const home = await $.process.run(argv, { timeoutMs: 5000 }).then(r => (r.exitCode === 0 ? r.stdout.trim() : ''), () => '')
  return { os, home, cliamp: await findCliamp($, os, home) }
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

async function playOrPause($: Engine) {
  const current = await read($, radio)
  if (current.isRunning) {
    await cliamp($, ['toggle'], 300)
    return
  }
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

async function changeVolume($: Engine, delta: number) {
  const current = await read($, radio)
  const target = Math.max(VOLUME_MIN, Math.min(VOLUME_MAX, current.volumeDb + delta))
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
    const storedRec = await $.store.get('rec')
    const storedWords = await $.store.get('recWords')
    const storedSkin = await $.store.get('skin')
    await update($, skin, () => (typeof storedSkin === 'string' && storedSkin in SKINS ? (storedSkin as SkinName) : 'neon'))
    await update($, rec, () => storedRec === true)
    await update($, recWords, () => (Array.isArray(storedWords) ? storedWords.filter((w): w is string => typeof w === 'string') : []))
    host = await detectHost($)
    await update($, user, () => host?.home.split(/[\\/]/).filter(Boolean).pop() ?? null)
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
    const nowMs = await read($, now)
    const lastTurn = await read($, lastTurnAt)
    const isRec = await read($, rec)
    const k = SKINS[await read($, skin)]
    const w = k.words
    const { Box, Button, Svg, Text } = $.ui.resolve(e) as ReturnType<typeof $.ui.resolve> & {
      Svg?: (props: { source: string; alt: string; width?: number; height?: number; isInteractive?: boolean }) => JSX.Element
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

        <Box key="radio" flexDirection="row" alignItems="center" flexWrap="wrap" gap="sm" borderStyle="single" borderColor={k.radioBorder} paddingX="sm" paddingY="xs">
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
              {isPlaying ? <Text color={k.rec}>{w.onAir}</Text> : w.paused} · {channel} · {r.volumeDb > 0 ? '+' : ''}
              {r.volumeDb} dB
            </Text>
          )}
          {r.isRunning && art(equalizer(k, isPlaying), 'Equalizer', 66, 24)}
          {r.isRunning && art(volumeBar(k, r.volumeDb), 'Volume', 70, 14)}
          <Box flexDirection="row" gap="xs">
            {r.isRunning && <Button key="prev" label="⏮" onPress={() => cliamp($, ['prev'], 800)} />}
            <Button key="play" label={isPlaying ? '❚❚' : '▶'} onPress={() => playOrPause($)} />
            {r.isRunning && <Button key="next" label="⏭" onPress={() => cliamp($, ['next'], 800)} />}
            {r.isRunning && <Button key="quieter" label="VOL −" onPress={() => changeVolume($, -VOLUME_STEP)} />}
            {r.isRunning && <Button key="louder" label="VOL +" onPress={() => changeVolume($, VOLUME_STEP)} />}
          </Box>
        </Box>
      </Box>
    )
  })
}
