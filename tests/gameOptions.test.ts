import { describe, expect, it } from 'vitest'
import { normalizeGameOptions, parseJvmArgs } from '../src/shared/gameOptions'

describe('parseJvmArgs', () => {
  it('accepts an empty text', () => expect(parseJvmArgs('   ')).toEqual({ ok: true, args: [] }))

  it('splits on any whitespace', () => {
    expect(parseJvmArgs(' -XX:+UseG1GC\n-XX:MaxGCPauseMillis=50  -Dfoo=bar ')).toEqual({ ok: true, args: ['-XX:+UseG1GC', '-XX:MaxGCPauseMillis=50', '-Dfoo=bar'] })
  })

  it.each(['-Xmx8G', '-xms2g', '-XMX4G'])('leaves memory to the RAM setting: %s', (arg) => {
    const result = parseJvmArgs(`-XX:+UseG1GC ${arg}`)
    expect(result.ok).toBe(false)
  })

  it.each(['-javaagent:evil.jar', '-agentlib:jdwp=transport=dt_socket', '-cp', '-jar'])('rejects %s', (arg) => {
    expect(parseJvmArgs(arg).ok).toBe(false)
  })

  it('rejects words that are not options', () => expect(parseJvmArgs('-XX:+UseG1GC calc.exe').ok).toBe(false))

  it('rejects too many arguments', () => expect(parseJvmArgs(Array.from({ length: 41 }, (_, i) => `-Da${i}=1`).join(' ')).ok).toBe(false))
})

describe('normalizeGameOptions', () => {
  it('falls back to defaults for anything unexpected', () => {
    expect(normalizeGameOptions(undefined)).toEqual({ width: null, height: null, fullscreen: false, jvmArgs: '' })
    expect(normalizeGameOptions('nope')).toEqual({ width: null, height: null, fullscreen: false, jvmArgs: '' })
  })

  it('keeps a valid size, fullscreen and arguments', () => {
    expect(normalizeGameOptions({ width: 1920, height: 1080, fullscreen: true, jvmArgs: ' -XX:+UseG1GC ' })).toEqual({ width: 1920, height: 1080, fullscreen: true, jvmArgs: '-XX:+UseG1GC' })
  })

  it('drops half a size or an out-of-range one', () => {
    expect(normalizeGameOptions({ width: 1920 })).toMatchObject({ width: null, height: null })
    expect(normalizeGameOptions({ width: 100, height: 1080 })).toMatchObject({ width: null, height: null })
    expect(normalizeGameOptions({ width: 1920.5, height: 1080 })).toMatchObject({ width: null, height: null })
  })

  it('drops forbidden arguments stored by hand', () => {
    expect(normalizeGameOptions({ jvmArgs: '-Xmx32G' }).jvmArgs).toBe('')
  })
})
