import { describe, expect, it } from 'vitest'
import { readActiveShader, readResourcePacks, toggleResourcePack, writeActiveShader, writeResourcePacks } from '../src/shared/gameFiles'

const OPTIONS = 'version:3465\r\nfov:0.0\r\nresourcePacks:["vanilla","mod_resources","file/Faithful.zip"]\r\nincompatibleResourcePacks:[]\r\n'

describe('resource packs in options.txt', () => {
  it('reads the enabled list', () => expect(readResourcePacks(OPTIONS)).toEqual(['vanilla', 'mod_resources', 'file/Faithful.zip']))

  it('reads nothing from a missing or broken line', () => {
    expect(readResourcePacks('fov:0.0')).toEqual([])
    expect(readResourcePacks('resourcePacks:[oops')).toEqual([])
  })

  it('rewrites only that line and keeps the line endings', () => {
    const next = writeResourcePacks(OPTIONS, ['vanilla'])
    expect(next).toBe('version:3465\r\nfov:0.0\r\nresourcePacks:["vanilla"]\r\nincompatibleResourcePacks:[]\r\n')
  })

  it('adds the line before the trailing newline when it is missing', () => {
    expect(writeResourcePacks('fov:0.0\n', ['vanilla', 'file/A.zip'])).toBe('fov:0.0\nresourcePacks:["vanilla","file/A.zip"]\n')
    expect(writeResourcePacks('', ['vanilla'])).toBe('resourcePacks:["vanilla"]')
  })

  it('enables a pack on top and disables it again', () => {
    const on = toggleResourcePack(['vanilla', 'mod_resources'], 'Faithful.zip', true)
    expect(on).toEqual(['vanilla', 'mod_resources', 'file/Faithful.zip'])
    expect(toggleResourcePack(on, 'Faithful.zip', false)).toEqual(['vanilla', 'mod_resources'])
  })

  it('moves an already enabled pack to the top instead of duplicating it', () => {
    expect(toggleResourcePack(['vanilla', 'file/A.zip', 'file/B.zip'], 'A.zip', true)).toEqual(['vanilla', 'file/B.zip', 'file/A.zip'])
  })

  it('keeps the base pack when the list was empty', () => expect(toggleResourcePack([], 'A.zip', true)).toEqual(['vanilla', 'file/A.zip']))
})

describe('shader properties', () => {
  it('reads the active pack', () => {
    expect(readActiveShader('enableShaders=true\nshaderPack=BSL_v8.2.09.zip\n')).toBe('BSL_v8.2.09.zip')
    expect(readActiveShader('shaderPack=Complementary\\:Reimagined.zip')).toBe('Complementary:Reimagined.zip')
  })

  it('reports none when shaders are off or unset', () => {
    expect(readActiveShader('enableShaders=false\nshaderPack=BSL.zip')).toBeNull()
    expect(readActiveShader('maxShadowRenderDistance=32')).toBeNull()
  })

  it('switches the pack and keeps other settings', () => {
    const next = writeActiveShader('enableShaders=false\nmaxShadowRenderDistance=32\n', 'BSL.zip')
    expect(next).toBe('enableShaders=true\nmaxShadowRenderDistance=32\n\nshaderPack=BSL.zip')
    expect(readActiveShader(next)).toBe('BSL.zip')
  })

  it('turns shaders off', () => {
    expect(readActiveShader(writeActiveShader('enableShaders=true\nshaderPack=BSL.zip', null))).toBeNull()
  })
})

describe('official packs', () => {
  it('lists the packs the modpack installed, files and folders, case-insensitively', async () => {
    const { officialPackNames } = await import('../electron/library')
    const files = { 'mods/jei.jar': 'x', 'resourcepacks/Orvian UI.zip': 'x', 'resourcepacks/Fancy/pack.mcmeta': 'x', 'shaderpacks/BSL.zip': 'x', 'resourcepacks\\Win Path.zip': 'x' }
    expect([...officialPackNames(files, 'resourcepacks')].sort()).toEqual(['fancy', 'orvian ui.zip', 'win path.zip'])
    expect([...officialPackNames(files, 'shaderpacks')]).toEqual(['bsl.zip'])
  })
})
