import { describe, expect, it } from 'vitest'
import { isSlimBitmap, parseNameMcAge, parseNameMcDate, skinPageDate } from '../electron/nameMc'
import { combine, TEXTURE_HASH } from '../electron/skinHistory'

/** A 64×64 RGBA bitmap, fully opaque unless `clear` lists pixels to leave transparent. */
function bitmap(clear: Array<[number, number]> = []): Uint8Array {
  const pixels = new Uint8Array(64 * 64 * 4).fill(255)
  for (const [x, y] of clear) pixels[(y * 64 + x) * 4 + 3] = 0
  return pixels
}

describe('NameMC history', () => {
  it('keeps only real dates and never invents one', () => {
    expect(parseNameMcDate('2021-04-29T09:37:32Z')).toBe(Date.parse('2021-04-29T09:37:32Z'))
    expect(parseNameMcDate(null)).toBe(0)
    expect(parseNameMcDate('Skin de Dream')).toBe(0)
    expect(parseNameMcDate('1999-01-01')).toBe(0)
  })

  it('reads the age under a skin, like "173d"', () => {
    const now = Date.UTC(2026, 9, 12)
    expect(parseNameMcAge('173d', now)).toBe(now - 173 * 86_400_000)
    expect(parseNameMcAge('5h', now)).toBe(now - 5 * 3_600_000)
    expect(parseNameMcAge('2y', now)).toBe(now - 2 * 365 * 86_400_000)
    expect(parseNameMcAge('3mo', now)).toBe(now - 90 * 86_400_000)
    expect(parseNameMcAge('173 likes', now)).toBe(0)
    expect(parseNameMcAge(null, now)).toBe(0)
  })

  it('prefers the exact date of a skin page over its age', () => {
    const now = Date.UTC(2026, 9, 12)
    expect(skinPageDate({ datetime: '2026-04-22T10:00:00Z', title: null, relative: '173d' }, now)).toBe(Date.parse('2026-04-22T10:00:00Z'))
    expect(skinPageDate({ datetime: null, title: '2026-04-22T10:00:00Z', relative: '173d' }, now)).toBe(Date.parse('2026-04-22T10:00:00Z'))
    expect(skinPageDate({ datetime: null, title: null, relative: '173d' }, now)).toBe(now - 173 * 86_400_000)
    expect(skinPageDate({ datetime: null, title: null, relative: null }, now)).toBe(0)
  })

  it('tells slim skins from classic ones by the empty arm columns', () => {
    const slimGap: Array<[number, number]> = []
    for (let y = 20; y < 32; y++) slimGap.push([54, y], [55, y])
    expect(isSlimBitmap(bitmap(slimGap), 64, 64)).toBe(true)
    expect(isSlimBitmap(bitmap(), 64, 64)).toBe(false)
    expect(isSlimBitmap(new Uint8Array(64 * 32 * 4), 64, 32)).toBe(false)
  })

  it('accepts NameMC texture keys and nothing that could escape the folder', () => {
    expect(TEXTURE_HASH.test('namemc-3ed4b6c5d5a5f5c1')).toBe(true)
    expect(TEXTURE_HASH.test(`laby-${'c'.repeat(32)}`)).toBe(true)
    expect(TEXTURE_HASH.test('a'.repeat(64))).toBe(true)
    expect(TEXTURE_HASH.test('namemc-../evil')).toBe(false)
    expect(TEXTURE_HASH.test('namemc-xyz')).toBe(false)
  })

  it('lets a real date replace an unknown one, and never the other way round', () => {
    const undated = { hash: 'namemc-3ed4b6c5d5a5f5c1', variant: 'classic' as const, firstSeenAt: 0, lastSeenAt: 0, sources: ['namemc' as const] }
    expect(combine(undated, 5000, 9000, 'labynet')).toMatchObject({ firstSeenAt: 5000, lastSeenAt: 9000, sources: ['namemc', 'labynet'] })
    const dated = { ...undated, firstSeenAt: 5000, lastSeenAt: 9000 }
    expect(combine(dated, 0, 0, 'namemc')).toMatchObject({ firstSeenAt: 5000, lastSeenAt: 9000 })
  })
})
