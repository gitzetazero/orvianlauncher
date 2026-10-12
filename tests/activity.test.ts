import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationCenter, PlayTimeTracker } from '../electron/activity'
import { isMinecraftSkinSize, readPngSize } from '../src/shared/png'
import { skinFromSessionProfile, textureUrl, toSkinProfile } from '../electron/skins'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'orvian-activity-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20))

describe('NotificationCenter', () => {
  it('keeps the newest first, marks read and survives a restart', async () => {
    const file = join(dir, 'n.json')
    const seen = vi.fn()
    let now = 1000
    const center = new NotificationCenter(file, seen, () => now)
    await center.load()
    center.add('pack', 'Modpack v2 disponible', 'Se instalará al jugar.')
    now = 2000
    center.add('crash', 'Minecraft se cerró', 'OutOfMemoryError')
    expect(center.list().map((n) => n.kind)).toEqual(['crash', 'pack'])
    expect(center.list().every((n) => !n.read)).toBe(true)

    center.markAllRead()
    expect(center.list().every((n) => n.read)).toBe(true)
    await settle()

    const again = new NotificationCenter(file, vi.fn())
    await again.load()
    expect(again.list()).toHaveLength(2)
    expect(again.list()[0]).toMatchObject({ kind: 'crash', at: 2000, read: true })
  })

  it('caps the history and ignores malformed entries', async () => {
    const file = join(dir, 'n.json')
    await writeFile(file, JSON.stringify([{ id: 'x', kind: 'bogus', title: 1 }, { id: 'a', kind: 'mods', title: 't', body: 'b', at: 1, read: false }]))
    const center = new NotificationCenter(file, vi.fn())
    await center.load()
    expect(center.list()).toHaveLength(1)
    for (let i = 0; i < 60; i++) center.add('mods', `m${i}`, '')
    expect(center.list()).toHaveLength(40)
    center.clear()
    expect(center.list()).toEqual([])
  })
})

describe('PlayTimeTracker', () => {
  it('adds the time between the game window opening and closing', async () => {
    const file = join(dir, 'stats.json')
    let now = 10_000
    const tracker = new PlayTimeTracker(file, vi.fn(), () => now)
    await tracker.load()
    expect(tracker.get()).toEqual({ lastPlayedAt: null, totalSeconds: 0 })

    tracker.begin()
    now += 90_000
    tracker.end()
    tracker.end() // a second exit report changes nothing
    expect(tracker.get()).toEqual({ lastPlayedAt: 100_000, totalSeconds: 90 })
    await settle()
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({ lastPlayedAt: 100_000, totalSeconds: 90 })
  })
})

describe('skins', () => {
  it('reads PNG sizes and accepts only Minecraft skin layouts', () => {
    const header = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 64, 0, 0, 0, 32])
    expect(readPngSize(header)).toEqual({ width: 64, height: 32 })
    expect(isMinecraftSkinSize(readPngSize(header))).toBe(true)
    expect(isMinecraftSkinSize({ width: 128, height: 128 })).toBe(false)
    expect(readPngSize(new Uint8Array(24))).toBeNull()
  })

  it('only trusts Mojang texture links, upgraded to https', () => {
    expect(textureUrl('http://textures.minecraft.net/texture/abc')).toBe('https://textures.minecraft.net/texture/abc')
    expect(textureUrl('https://evil.test/texture/abc')).toBeNull()
    expect(textureUrl(42)).toBeNull()
  })

  it('maps the profile answer', () => {
    const profile = toSkinProfile(
      {
        name: 'Payo',
        skins: [
          { id: '1', state: 'INACTIVE', url: 'http://textures.minecraft.net/texture/old', variant: 'CLASSIC' },
          { id: '2', state: 'ACTIVE', url: 'http://textures.minecraft.net/texture/new', variant: 'SLIM' }
        ],
        capes: [
          { id: 'c1', state: 'ACTIVE', url: 'http://textures.minecraft.net/texture/cape', alias: 'Migrator' },
          { id: 'c2', state: 'INACTIVE', url: 'https://evil.test/cape' }
        ]
      },
      'fallback'
    )
    expect(profile).toEqual({
      name: 'Payo',
      skin: { url: 'https://textures.minecraft.net/texture/new', variant: 'slim' },
      capes: [{ id: 'c1', alias: 'Migrator', url: 'https://textures.minecraft.net/texture/cape', active: true }]
    })
  })

  it('reads the skin link from a public session profile', () => {
    const value = Buffer.from(JSON.stringify({ textures: { SKIN: { url: 'http://textures.minecraft.net/texture/abc' } } })).toString('base64')
    expect(skinFromSessionProfile({ properties: [{ name: 'textures', value }] })).toBe('https://textures.minecraft.net/texture/abc')
    expect(skinFromSessionProfile({ properties: [] })).toBeNull()
    expect(skinFromSessionProfile({ properties: [{ name: 'textures', value: 'not-base64-json' }] })).toBeNull()
    expect(skinFromSessionProfile(null)).toBeNull()
  })
})
