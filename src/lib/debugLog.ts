const PREFIX_STYLE = 'color:#a06b1a;font-weight:700'
const ACCENT_STYLE = 'color:#5b7a4a;font-weight:600'
const WARN_STYLE = 'color:#a06b1a;font-weight:600'
const ERROR_STYLE = 'color:#9a3a1c;font-weight:700'
const MUTED_STYLE = 'color:#6c6357'

const STORAGE_FLAG = 'promptcanvas:debug'

function isEnabled(): boolean {
  if (typeof localStorage === 'undefined') return true
  try {
    const flag = localStorage.getItem(STORAGE_FLAG)
    if (flag === null) return true
    const lower = flag.trim().toLowerCase()
    if (lower === 'false' || lower === '0' || lower === 'off') return false
    return true
  } catch {
    return true
  }
}

export function maskKey(key: string | undefined | null): string {
  if (!key) return '<empty>'
  const trimmed = key.trim()
  if (trimmed.length <= 8) return `*** (len=${trimmed.length})`
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)} (len=${trimmed.length})`
}

export function safeHostname(url: string | undefined | null): string {
  if (!url) return '<empty>'
  try {
    return new URL(url).host
  } catch {
    return 'invalid-url'
  }
}

export function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

export interface LogGroupHandle {
  log: (label: string, ...values: unknown[]) => void
  warn: (label: string, ...values: unknown[]) => void
  error: (label: string, ...values: unknown[]) => void
  table: (data: unknown) => void
  end: () => void
}

const NOOP_GROUP: LogGroupHandle = {
  log: () => {},
  warn: () => {},
  error: () => {},
  table: () => {},
  end: () => {},
}

export function logGroup(label: string, kind: 'info' | 'warn' | 'error' = 'info'): LogGroupHandle {
  if (!isEnabled()) return NOOP_GROUP

  const accent = kind === 'error' ? ERROR_STYLE : kind === 'warn' ? WARN_STYLE : ACCENT_STYLE
  const collapsed = kind === 'error' ? console.group : console.groupCollapsed
  collapsed.call(console, `%c[promptcanvas]%c ${label}`, PREFIX_STYLE, accent)

  return {
    log(label, ...values) {
      console.log(`%c${label}`, MUTED_STYLE, ...values)
    },
    warn(label, ...values) {
      console.warn(`%c${label}`, WARN_STYLE, ...values)
    },
    error(label, ...values) {
      console.error(`%c${label}`, ERROR_STYLE, ...values)
    },
    table(data) {
      try {
        console.table(data)
      } catch {
        console.log(data)
      }
    },
    end() {
      console.groupEnd()
    },
  }
}

export function logBanner(message: string, kind: 'info' | 'warn' | 'error' = 'info'): void {
  if (!isEnabled()) return
  const accent = kind === 'error' ? ERROR_STYLE : kind === 'warn' ? WARN_STYLE : ACCENT_STYLE
  console.log(`%c[promptcanvas]%c ${message}`, PREFIX_STYLE, accent)
}

export function snapshotResponseHeaders(response: Response): Record<string, string> {
  const interesting = [
    'content-type',
    'content-length',
    'access-control-allow-origin',
    'access-control-expose-headers',
    'access-control-allow-credentials',
    'x-request-id',
    'x-ratelimit-remaining',
    'x-ratelimit-limit',
    'cf-ray',
    'server',
    'date',
  ]
  const result: Record<string, string> = {}
  for (const name of interesting) {
    const value = response.headers.get(name)
    if (value !== null) result[name] = value
  }
  return result
}
