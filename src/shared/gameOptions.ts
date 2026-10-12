import { DEFAULT_GAME_OPTIONS, type GameOptions } from './launcher-state'

const MAX_JVM_TEXT = 2000
const MAX_JVM_ARGS = 40
/** Memory comes from the RAM slider; a second value here would silently fight it. */
const MANAGED_PREFIXES = ['-xmx', '-xms']
/** Loading agents or replacing the classpath is not something a launch option should be able to do. */
const BLOCKED_PREFIXES = ['-javaagent', '-agentlib', '-agentpath', '-cp', '-classpath', '--class-path', '-jar']

export type JvmArgsResult = { ok: true; args: string[] } | { ok: false; error: string }

/** Splits the text the player typed into JVM arguments and rejects the ones the launcher manages or forbids. */
export function parseJvmArgs(text: string): JvmArgsResult {
  const clean = text.trim()
  if (!clean) return { ok: true, args: [] }
  if (clean.length > MAX_JVM_TEXT) return { ok: false, error: 'Los argumentos son demasiado largos.' }
  const args = clean.split(/\s+/)
  if (args.length > MAX_JVM_ARGS) return { ok: false, error: `Como máximo ${MAX_JVM_ARGS} argumentos.` }
  for (const arg of args) {
    const lower = arg.toLowerCase()
    if (!arg.startsWith('-')) return { ok: false, error: `«${arg.slice(0, 40)}» no es un argumento de Java: deben empezar por un guion.` }
    if (MANAGED_PREFIXES.some((prefix) => lower.startsWith(prefix))) return { ok: false, error: 'La memoria se ajusta con el control de Memoria RAM, no con -Xmx ni -Xms.' }
    if (BLOCKED_PREFIXES.some((prefix) => lower === prefix || lower.startsWith(`${prefix}:`) || lower.startsWith(`${prefix}=`))) {
      return { ok: false, error: `${arg.split(/[:=]/)[0]} no está permitido.` }
    }
  }
  return { ok: true, args }
}

const MIN_SIZE = 320
const MAX_SIZE = 7680

/** Keeps a stored or submitted value within what the launcher accepts; anything odd falls back to the default. */
export function normalizeGameOptions(value: unknown): GameOptions {
  if (!value || typeof value !== 'object') return { ...DEFAULT_GAME_OPTIONS }
  const raw = value as Record<string, unknown>
  const size = (n: unknown): number | null => (Number.isInteger(n) && (n as number) >= MIN_SIZE && (n as number) <= MAX_SIZE ? (n as number) : null)
  const width = size(raw.width)
  const height = size(raw.height)
  const jvmArgs = typeof raw.jvmArgs === 'string' && parseJvmArgs(raw.jvmArgs).ok ? raw.jvmArgs.trim() : ''
  return {
    // A size is only meaningful as a pair
    width: width !== null && height !== null ? width : null,
    height: width !== null && height !== null ? height : null,
    fullscreen: raw.fullscreen === true,
    jvmArgs
  }
}

export const GAME_SIZE_LIMITS = { min: MIN_SIZE, max: MAX_SIZE } as const
