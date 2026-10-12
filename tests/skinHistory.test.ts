import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { combine, parseCraftySkins, parseLabySkins, SkinHistory, textureHash } from '../electron/skinHistory'
import { skinTextureFromSession } from '../electron/skins'

const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)

/** A minimal 64×64 PNG header: enough for the size check. */
function pngBytes(): Uint8Array {
  const bytes = new Uint8Array(new ArrayBuffer(64))
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 64, 0, 0, 0, 64])
  return bytes
}

describe('skin history rules', () => {
  it('takes the texture hash from a Mojang link', () => {
    expect(textureHash(`https://textures.minecraft.net/texture/${HASH_A}`)).toBe(HASH_A)
    expect(textureHash('https://textures.minecraft.net/texture/../evil')).toBeNull()
  })

  it('reads the arm model from a session profile', () => {
    const value = Buffer.from(JSON.stringify({ textures: { SKIN: { url: `http://textures.minecraft.net/texture/${HASH_A}`, metadata: { model: 'slim' } } } })).toString('base64')
    expect(skinTextureFromSession({ properties: [{ name: 'textures', value }] })).toEqual({ url: `https://textures.minecraft.net/texture/${HASH_A}`, variant: 'slim' })
  })
})

describe('SkinHistory', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'orvian-skin-history-'))
  })
  afterEach(async () => {
    vi.unstubAllGlobals()
    await rm(dir, { recursive: true, force: true })
  })

  it('downloads a texture once and records later sightings without downloading again', async () => {
    const fetchMock = vi.fn(async () => new Response(new Blob([pngBytes() as Uint8Array<ArrayBuffer>])))
    vi.stubGlobal('fetch', fetchMock)
    let now = 1000
    const history = new SkinHistory(dir, () => now, () => 'pixels-a')

    await history.record(`https://textures.minecraft.net/texture/${HASH_A}`, 'classic')
    now = 2000
    await history.record(`https://textures.minecraft.net/texture/${HASH_A}`, 'classic')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((await stat(history.pathOf(HASH_A))).isFile()).toBe(true)
    expect(await history.read()).toEqual({ current: HASH_A, entries: [{ hash: HASH_A, variant: 'classic', firstSeenAt: 1000, lastSeenAt: 2000, sources: ['launcher'], pixels: 'pixels-a' }] })

    await history.remove(HASH_A)
    expect((await history.read()).entries).toEqual([])
  })

  it('ignores a download that is not a skin', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>nope</html>')))
    const history = new SkinHistory(dir, Date.now, () => null)
    await history.record(`https://textures.minecraft.net/texture/${HASH_B}`, 'classic')
    expect((await history.read()).entries).toEqual([])
  })
})

describe('public skin histories', () => {
  it('reads Crafty.gg skins and drops malformed ones', () => {
    const body = { data: { skins: [
      { hash: HASH_A.toUpperCase(), slim: true, changed_at: '2025-01-13T08:20:32.200+01:00' },
      { hash: 'not-a-hash', slim: false, changed_at: '2025-01-01T00:00:00Z' },
      { hash: HASH_B, slim: false, created_at: '2021-06-01T07:37:51.398+02:00' }
    ] } }
    const skins = parseCraftySkins(body)
    expect(skins.map((skin) => [skin.key, skin.variant, skin.source])).toEqual([[HASH_A, 'slim', 'crafty'], [HASH_B, 'classic', 'crafty']])
    expect(skins[0].url).toBe(`https://textures.minecraft.net/texture/${HASH_A}`)
    expect(parseCraftySkins({ success: false })).toEqual([])
  })

  it('reads LabyNet skins with their first and last sighting', () => {
    const md5 = 'c'.repeat(32)
    const skins = parseLabySkins({ SKIN: [
      { image_hash: md5, slim_skin: true, first_seen_at: '2021-04-29T09:37:32+00:00', last_seen_at: '2026-10-11T23:40:19+00:00' },
      { image_hash: 'zz', first_seen_at: '2021-01-01T00:00:00Z' },
      { image_hash: 'd'.repeat(32), first_seen_at: null, last_seen_at: null }
    ], CAPE: [] })
    expect(skins).toEqual([{ key: `laby-${md5}`, url: `https://texture.laby.net/${md5}.png`, variant: 'slim', firstSeenAt: Date.parse('2021-04-29T09:37:32+00:00'), lastSeenAt: Date.parse('2026-10-11T23:40:19+00:00'), source: 'labynet' }])
  })

  it('combines dates and sources of the same skin', () => {
    const entry = { hash: HASH_A, variant: 'classic' as const, firstSeenAt: 5000, lastSeenAt: 9000, sources: ['launcher' as const] }
    expect(combine(entry, 1000, 4000, 'labynet')).toEqual({ ...entry, firstSeenAt: 1000, lastSeenAt: 9000, sources: ['launcher', 'labynet'] })
  })

  it('keeps one entry when two services report the same image', async () => {
    const dir2 = await mkdtemp(join(tmpdir(), 'orvian-skin-merge-'))
    try {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob([pngBytes() as Uint8Array<ArrayBuffer>]))))
      // Every download is the same picture, so every source points at one skin
      const history = new SkinHistory(dir2, () => 10_000, () => 'same-pixels')
      const added = await history.mergeRemote([
        { key: HASH_A, url: 'https://textures.minecraft.net/texture/a', variant: 'classic', firstSeenAt: 3000, lastSeenAt: 3000, source: 'crafty' },
        { key: `laby-${'c'.repeat(32)}`, url: 'https://texture.laby.net/c.png', variant: 'classic', firstSeenAt: 1000, lastSeenAt: 8000, source: 'labynet' }
      ])
      expect(added).toBe(1)
      const file = await history.read()
      expect(file.entries).toHaveLength(1)
      expect(file.entries[0]).toMatchObject({ hash: HASH_A, firstSeenAt: 1000, lastSeenAt: 8000, sources: ['crafty', 'labynet'] })
    } finally {
      vi.unstubAllGlobals()
      await rm(dir2, { recursive: true, force: true })
    }
  })
})
