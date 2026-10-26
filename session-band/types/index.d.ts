export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

export type Meter = {
  tokens: number | null
  window: number
  limits: Limit[]
  costUsd: number | null
}

export type Place = { project: string; branch: string | null }

export type Source = 'cliamp' | 'spotify'

export type Radio = {
  source: Source
  // Spotify's own 0-100 volume; null for cliamp, which reports volumeDb.
  volumePercent: number | null
  isRunning: boolean
  state: string
  station: string | null
  track: string | null
  index: number | null
  total: number | null
  volumeDb: number
}

export type SkinName = 'neon' | 'hacker' | 'pro'

declare module 'claude-code' {
  interface PluginState {
    'session-band': {
      skin: SkinName
      meter: Meter | null
      place: Place | null
      radio: Radio
      genre: string | null
      source: Source
      now: number
      lastTurnAt: number
      rec: boolean
      recWords: string[]
      user: string | null
    }
  }
}
