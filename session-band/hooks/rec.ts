// Rec mode: what is drawn on screen hides personal and secret values; the model and the
// stored transcript keep the original text, because only render hooks see the masked copy.

export const MASK = '██████'

const PATTERNS: RegExp[] = [
  // Credentials inside a URL (postgres://user:pass@host): the user and password part.
  /(?<=\b[a-z][a-z0-9+.-]*:\/\/)[^\s:@/]+:[^\s@/]+(?=@)/gi,
  // E-mail addresses.
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  // Vendor token shapes.
  /\bsk-(?:ant-)?[A-Za-z0-9_-]{16,}/g,
  /\b(?:ghp|gho|ghs|ghu|ghr)_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bAIza[0-9A-Za-z_-]{35}\b/g,
  /\bdop_v1_[a-f0-9]{64}\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  /(?<=\bBearer\s+)[A-Za-z0-9._~+/-]{16,}=*/g,
  // The value of an assignment that names a secret (password=..., api_key: ...).
  /(?<=(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|client[_-]?secret)\s*[:=]\s*["']?)[^\s"',;]+/gi,
  // IPv4, and IPv6 written with at least four groups (so a clock time is left alone).
  /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,
  /\b(?:[0-9a-f]{1,4}:){3,7}[0-9a-f]{1,4}\b/gi,
]

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function redactor(words: readonly string[]): (text: string) => string {
  const named = words
    .map(w => w.trim())
    .filter(w => w.length >= 2)
    .map(w => new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(w)}(?![\\p{L}\\p{N}_])`, 'giu'))
  const all = [...PATTERNS, ...named]
  return text => all.reduce((out, re) => out.replace(re, MASK), text)
}

// Every string inside a tool's input or output, at any depth.
export function redactDeep(value: unknown, redact: (text: string) => string): unknown {
  if (typeof value === 'string') return redact(value)
  if (Array.isArray(value)) return value.map(v => redactDeep(v, redact))
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactDeep(v, redact)]))
  }
  return value
}
