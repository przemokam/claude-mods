// Small fixed-size SVG pieces of the band (rings, the context bar, the equalizer, the volume),
// and the skins that colour them. The text around them is the surface's own, so it stays
// readable at any band width. The desktop draws each piece in a script-less frame: animation
// is CSS only.

import type { SkinName } from '../types'

export type Tone = 'ok' | 'warn' | 'alarm' | 'idle'

export const VOLUME_MIN = -30
export const VOLUME_MAX = 6

export type Skin = {
  name: SkinName
  title: string
  panel: string
  border: string
  ink: string
  dim: string
  // The unfilled part of a ring.
  track: string
  // The project name and the cost.
  accent: string
  // The branch and the station.
  info: string
  rec: string
  tone: Record<Tone, string>
  // The text face of labels; numbers and the track are mono in every skin.
  mono: boolean
  letters: 'upper' | 'lower' | 'asis'
  badge: { text: string; bg: string; ink: string } | null
  radioBadge: { text: string; bg: string | null; ink: string }
  radioBorder: string
  words: {
    ctx: string
    limit: (label: string) => string
    cache: string
    cold: string
    onAir: string
    paused: string
    offline: string
    channel: string
    rec: [on: string, off: string]
    handoff: string
    fiveHour: string
    sevenDay: string
  }
  // SVG pieces.
  glow: number
  ticks: 'spin' | 'still' | 'none'
  ringWidth: number
  bar: 'segments' | 'line'
  mark: string
  eq: [string, string]
  eqPace: number
  flatVolume: boolean
}

const NEON_Y = '#FCEE0A'
const NEON_C = '#00F0FF'
const NEON_R = '#FF003C'
const NEON_M = '#FF2A6D'
const NEON_DIM = '#7A7F99'
const NEON_PANEL = '#0A0A12'

// The original cyberpunk band: yellow, cyan and magenta on black.
const neon: Skin = {
  name: 'neon',
  title: 'NEON',
  panel: NEON_PANEL,
  border: NEON_Y,
  ink: '#ECECF4',
  dim: NEON_DIM,
  track: '#20233a',
  accent: NEON_Y,
  info: NEON_C,
  rec: NEON_R,
  tone: { ok: NEON_C, warn: NEON_Y, alarm: NEON_R, idle: NEON_DIM },
  mono: true,
  letters: 'upper',
  badge: { text: ' NETRUN // ', bg: NEON_Y, ink: NEON_PANEL },
  radioBadge: { text: ' NEON FM ', bg: NEON_M, ink: NEON_PANEL },
  radioBorder: NEON_M,
  words: {
    ctx: 'CTX',
    limit: label => `${label} LIMIT`,
    cache: 'CACHE',
    cold: 'cold',
    onAir: '● ON AIR',
    paused: '❚❚ PAUSED',
    offline: 'OFFLINE',
    channel: 'CH',
    rec: ['● REC', '○ REC'],
    handoff: '⇢ NEW CHAT',
    fiveHour: '5H',
    sevenDay: '7D',
  },
  glow: 1.6,
  ticks: 'spin',
  ringWidth: 3.5,
  bar: 'segments',
  mark: NEON_M,
  eq: [NEON_C, NEON_M],
  eqPace: 1,
  flatVolume: false,
}

const PHOSPHOR = '#86D69B'
const HACKER_DIM = '#62786A'
const HACKER_LINE = '#2A3D31'

// A terminal at night: one phosphor green, amber and a soft red only when a number needs it.
const hacker: Skin = {
  name: 'hacker',
  title: 'hacker',
  panel: '#0C110E',
  border: HACKER_LINE,
  ink: '#C3D3C7',
  dim: HACKER_DIM,
  track: '#18231C',
  accent: PHOSPHOR,
  info: '#9FBBA7',
  rec: '#E07A6B',
  tone: { ok: PHOSPHOR, warn: '#D6B26C', alarm: '#E07A6B', idle: HACKER_DIM },
  mono: true,
  letters: 'lower',
  badge: { text: ' >_ ', bg: PHOSPHOR, ink: '#0C110E' },
  radioBadge: { text: ' tty/fm ', bg: HACKER_LINE, ink: PHOSPHOR },
  radioBorder: HACKER_LINE,
  words: {
    ctx: 'ctx',
    limit: label => `${label} limit`,
    cache: 'cache',
    cold: 'cold',
    onAir: '● on air',
    paused: '❚❚ paused',
    offline: 'offline',
    channel: 'ch',
    rec: ['● rec', '○ rec'],
    handoff: '→ new chat',
    fiveHour: '5h',
    sevenDay: '7d',
  },
  glow: 0.7,
  ticks: 'still',
  ringWidth: 3,
  bar: 'segments',
  mark: '#D6B26C',
  eq: [PHOSPHOR, '#4F8A61'],
  eqPace: 1.4,
  flatVolume: true,
}

const STEEL = '#8AA6C8'
const PRO_DIM = '#8B919D'
const PRO_LINE = '#2A2E37'

// Graphite and one muted steel blue; ochre and brick only for warnings. No glow, no motion
// but the equalizer.
const pro: Skin = {
  name: 'pro',
  title: 'Pro',
  panel: '#15171C',
  border: PRO_LINE,
  ink: '#E3E5EA',
  dim: PRO_DIM,
  track: '#252932',
  accent: '#E3E5EA',
  info: '#A3ACBA',
  rec: '#C9706B',
  tone: { ok: STEEL, warn: '#C8A35E', alarm: '#C9706B', idle: PRO_DIM },
  mono: false,
  letters: 'asis',
  badge: null,
  radioBadge: { text: 'Radio', bg: null, ink: PRO_DIM },
  radioBorder: PRO_LINE,
  words: {
    ctx: 'Context',
    limit: label => `${label} limit`,
    cache: 'Cache',
    cold: 'cold',
    onAir: '● Live',
    paused: '❚❚ Paused',
    offline: 'Off',
    channel: 'Channel',
    rec: ['● Rec', '○ Rec'],
    handoff: '→ New chat',
    fiveHour: '5h',
    sevenDay: '7d',
  },
  glow: 0,
  ticks: 'none',
  ringWidth: 3,
  bar: 'line',
  mark: '#5D6573',
  eq: [STEEL, STEEL],
  eqPace: 1.8,
  flatVolume: true,
}

export const SKINS: Record<SkinName, Skin> = { neon, hacker, pro }
export const SKIN_ORDER: SkinName[] = ['neon', 'hacker', 'pro']

export function nextSkin(name: SkinName): SkinName {
  return SKIN_ORDER[(SKIN_ORDER.indexOf(name) + 1) % SKIN_ORDER.length] ?? 'neon'
}

export function cased(skin: Skin, text: string): string {
  return skin.letters === 'upper' ? text.toUpperCase() : skin.letters === 'lower' ? text.toLowerCase() : text
}

function svg(skin: Skin, w: number, h: number, body: string, css = ''): string {
  const glow =
    skin.glow > 0
      ? `<defs><filter id="g" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${skin.glow}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`
      : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${glow}<style>
  .spin{transform-box:fill-box;transform-origin:center;animation:spin 20s linear infinite}
  .pulse{animation:pulse 1.1s ease-in-out infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
  ${css}</style>${body}</svg>`
}

const glowed = (skin: Skin) => (skin.glow > 0 ? ' filter="url(#g)"' : '')

// Deterministic, so a piece looks the same on every redraw.
function seeded(seed: number) {
  let x = seed
  return () => {
    x = (x * 1103515245 + 12345) & 0x7fffffff
    return x / 0x7fffffff
  }
}

const ICONS = {
  chip: (c: string) =>
    `<rect x="17" y="17" width="12" height="12" rx="1.5" fill="none" stroke="${c}" stroke-width="1.8"/><rect x="20.5" y="20.5" width="5" height="5" fill="${c}"/>` +
    [19, 23, 27].map(p => `<line x1="${p}" y1="14" x2="${p}" y2="17" stroke="${c}" stroke-width="1.4"/><line x1="${p}" y1="29" x2="${p}" y2="32" stroke="${c}" stroke-width="1.4"/><line x1="14" y1="${p}" x2="17" y2="${p}" stroke="${c}" stroke-width="1.4"/><line x1="29" y1="${p}" x2="32" y2="${p}" stroke="${c}" stroke-width="1.4"/>`).join(''),
  clock: (c: string) =>
    `<circle cx="23" cy="23" r="8" fill="none" stroke="${c}" stroke-width="1.8"/><path d="M23 18.5 V23 L26.5 25" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/>`,
  calendar: (c: string) =>
    `<rect x="15.5" y="17" width="15" height="13" rx="1.5" fill="none" stroke="${c}" stroke-width="1.8"/><line x1="15.5" y1="21" x2="30.5" y2="21" stroke="${c}" stroke-width="1.8"/><line x1="19" y1="14.5" x2="19" y2="18.5" stroke="${c}" stroke-width="1.8"/><line x1="27" y1="14.5" x2="27" y2="18.5" stroke="${c}" stroke-width="1.8"/><rect x="18.5" y="24" width="3" height="3" fill="${c}"/>`,
}

export function ring(skin: Skin, percent: number | null, tone: Tone, icon: keyof typeof ICONS): string {
  const c = skin.tone[tone]
  const r = 18
  const len = 2 * Math.PI * r
  const shown = percent === null ? 0 : Math.min(percent, 100) / 100
  const count = skin.ticks === 'spin' ? 16 : 12
  const ticks =
    skin.ticks === 'none'
      ? ''
      : `<g${skin.ticks === 'spin' ? ' class="spin"' : ''} stroke="${c}" stroke-opacity="${skin.ticks === 'spin' ? 0.55 : 0.3}" stroke-width="1.4">${Array.from({ length: count }, (_, i) => {
          const a = (i / count) * 2 * Math.PI
          return `<line x1="${(23 + Math.cos(a) * 20.5).toFixed(1)}" y1="${(23 + Math.sin(a) * 20.5).toFixed(1)}" x2="${(23 + Math.cos(a) * 22.5).toFixed(1)}" y2="${(23 + Math.sin(a) * 22.5).toFixed(1)}"/>`
        }).join('')}</g>`
  return svg(
    skin,
    46,
    46,
    `${ticks}
  <circle cx="23" cy="23" r="${r}" fill="${skin.panel}" stroke="${skin.track}" stroke-width="${skin.ringWidth}"/>
  <circle${tone === 'alarm' ? ' class="pulse"' : ''} cx="23" cy="23" r="${r}" fill="none" stroke="${c}" stroke-width="${skin.ringWidth}" stroke-linecap="${skin.bar === 'line' ? 'round' : 'butt'}"
    stroke-dasharray="${(len * shown).toFixed(1)} ${len.toFixed(1)}" transform="rotate(-90 23 23)"${glowed(skin)}/>
  ${ICONS[icon](c)}`,
  )
}

// The context window drawn to scale, with a line where Claude Code compacts the conversation:
// segments coloured by the warn and alarm zones, or one thin bar in the tone of the fill.
export function contextBar(skin: Skin, tokens: number, window: number, compactAt: number, warnAt: number, alarmAt: number): string {
  const w = 170
  const mark = (compactAt / window) * w
  const markLine = `<line x1="${mark.toFixed(1)}" y1="0" x2="${mark.toFixed(1)}" y2="14" stroke="${skin.mark}" stroke-width="${skin.bar === 'line' ? 1.5 : 2}"${glowed(skin)}/>`
  if (skin.bar === 'line') {
    const tone = tokens >= alarmAt ? skin.tone.alarm : tokens >= warnAt ? skin.tone.warn : skin.tone.ok
    const filled = Math.max(0, Math.min(w, (tokens / window) * w))
    return svg(
      skin,
      w,
      14,
      `<rect x="0" y="5" width="${w}" height="4" rx="2" fill="${skin.track}"/><rect x="0" y="5" width="${filled.toFixed(1)}" height="4" rx="2" fill="${tone}"/>${markLine}`,
    )
  }
  const n = 32
  const step = w / n
  const per = window / n
  const filled = Math.min(n, Math.round(tokens / per))
  const segs = Array.from({ length: n }, (_, i) => {
    const at = (i + 0.5) * per
    const color = at >= alarmAt ? skin.tone.alarm : at >= warnAt ? skin.tone.warn : skin.tone.ok
    const on = i < filled
    return `<rect${on && i === filled - 1 ? ' class="pulse"' : ''} x="${(i * step).toFixed(1)}" y="3" width="${(step - 1.5).toFixed(1)}" height="8" fill="${color}" fill-opacity="${on ? 0.95 : 0.13}"/>`
  }).join('')
  return svg(skin, w, 14, `${segs}${markLine}`)
}

export function equalizer(skin: Skin, isPlaying: boolean): string {
  const rand = seeded(42)
  const bars = Array.from({ length: 11 }, (_, i) => {
    const style = isPlaying ? ` style="animation-duration:${((0.35 + rand() * 0.6) * skin.eqPace).toFixed(2)}s"` : ''
    const width = skin.bar === 'line' ? 3 : 4
    return `<rect x="${i * 6}" y="0" width="${width}" height="24" rx="${skin.bar === 'line' ? 1.5 : 0}" fill="${i % 4 === 0 ? skin.eq[1] : skin.eq[0]}" class="${isPlaying ? 'eq' : 'eq off'}"${style}/>`
  }).join('')
  return svg(
    skin,
    66,
    24,
    bars,
    `.eq{transform-box:fill-box;transform-origin:bottom;animation-name:eq;animation-iteration-count:infinite;animation-timing-function:ease-in-out}
  .eq.off{transform:scaleY(.15);opacity:.45}@keyframes eq{0%,100%{transform:scaleY(.18)}50%{transform:scaleY(1)}}`,
  )
}

export function volumeBar(skin: Skin, db: number): string {
  const level = (db - VOLUME_MIN) / (VOLUME_MAX - VOLUME_MIN)
  const bars = Array.from({ length: 12 }, (_, i) => {
    const h = 4 + i * 0.8
    const color = skin.flatVolume ? skin.tone.ok : i >= 10 ? skin.tone.alarm : i >= 7 ? skin.tone.warn : skin.tone.ok
    return `<rect x="${i * 6}" y="${(14 - h).toFixed(1)}" width="4" height="${h.toFixed(1)}" fill="${color}" fill-opacity="${(i + 0.5) / 12 <= level ? 0.95 : 0.15}"/>`
  }).join('')
  return svg(skin, 70, 14, bars)
}
