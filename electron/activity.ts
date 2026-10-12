import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { LauncherNotification, NotificationKind, PlayStats } from '../src/shared/launcher-state'
import { log } from './logger'

/** Small JSON files the launcher keeps about the player's own activity: notifications and play time. */

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  } catch {
    return fallback
  }
}

/** Writes to the same file one after another, always with the latest value: overlapping writes would mix two versions. */
class JsonWriter {
  private chain: Promise<void> = Promise.resolve()

  constructor(private readonly path: string, private readonly label: string) {}

  save(value: unknown): void {
    const text = JSON.stringify(value, null, 2)
    this.chain = this.chain
      .then(async () => {
        await mkdir(dirname(this.path), { recursive: true })
        await writeFile(this.path, text, 'utf8')
      })
      .catch((err: unknown) => log.warn('[%s] No se pudo guardar: %s', this.label, String(err)))
  }
}

const MAX_NOTIFICATIONS = 40
const KINDS: readonly NotificationKind[] = ['pack', 'install', 'crash', 'mods', 'launcher', 'account', 'skin']

function isNotification(value: unknown): value is LauncherNotification {
  if (!value || typeof value !== 'object') return false
  const n = value as Record<string, unknown>
  return typeof n.id === 'string' && KINDS.includes(n.kind as NotificationKind) && typeof n.title === 'string' && typeof n.body === 'string' && typeof n.at === 'number' && typeof n.read === 'boolean'
}

/** Recent launcher events, newest first, kept across restarts. */
export class NotificationCenter {
  private items: LauncherNotification[] = []
  private readonly writer: JsonWriter

  constructor(
    private readonly file: string,
    private readonly onChange: (items: LauncherNotification[]) => void,
    private readonly now: () => number = Date.now
  ) {
    this.writer = new JsonWriter(file, 'Avisos')
  }

  async load(): Promise<void> {
    const stored = await readJson<unknown>(this.file, [])
    this.items = Array.isArray(stored) ? stored.filter(isNotification).slice(0, MAX_NOTIFICATIONS) : []
    this.onChange(this.list())
  }

  list(): LauncherNotification[] {
    return this.items.map((item) => ({ ...item }))
  }

  add(kind: NotificationKind, title: string, body: string): void {
    this.items = [{ id: randomUUID(), kind, title, body, at: this.now(), read: false }, ...this.items].slice(0, MAX_NOTIFICATIONS)
    this.persist()
  }

  markAllRead(): void {
    if (this.items.every((item) => item.read)) return
    this.items = this.items.map((item) => ({ ...item, read: true }))
    this.persist()
  }

  clear(): void {
    this.items = []
    this.persist()
  }

  private persist(): void {
    this.onChange(this.list())
    this.writer.save(this.items)
  }
}

/** Adds up the time Minecraft stays open. Only sessions the launcher saw are counted. */
export class PlayTimeTracker {
  private stats: PlayStats = { lastPlayedAt: null, totalSeconds: 0 }
  private startedAt: number | null = null
  private readonly writer: JsonWriter

  constructor(
    private readonly file: string,
    private readonly onChange: (stats: PlayStats) => void,
    private readonly now: () => number = Date.now
  ) {
    this.writer = new JsonWriter(file, 'Tiempo de juego')
  }

  async load(): Promise<void> {
    const stored = await readJson<Partial<PlayStats>>(this.file, {})
    this.stats = {
      lastPlayedAt: typeof stored.lastPlayedAt === 'number' ? stored.lastPlayedAt : null,
      totalSeconds: typeof stored.totalSeconds === 'number' && stored.totalSeconds >= 0 ? Math.floor(stored.totalSeconds) : 0
    }
    this.onChange({ ...this.stats })
  }

  get(): PlayStats {
    return { ...this.stats }
  }

  begin(): void {
    if (this.startedAt !== null) return
    this.startedAt = this.now()
    this.stats = { ...this.stats, lastPlayedAt: this.startedAt }
    this.save()
  }

  end(): void {
    if (this.startedAt === null) return
    const seconds = Math.max(0, Math.round((this.now() - this.startedAt) / 1000))
    this.startedAt = null
    this.stats = { lastPlayedAt: this.now(), totalSeconds: this.stats.totalSeconds + seconds }
    this.save()
  }

  private save(): void {
    this.onChange({ ...this.stats })
    this.writer.save(this.stats)
  }
}
