/** Reading and editing the bits of Minecraft's own files that the launcher manages for the player. */

const PACKS_KEY = 'resourcePacks'

/** Entries of `resourcePacks:[...]` in options.txt, e.g. `["vanilla","file/Faithful.zip"]`. */
export function readResourcePacks(optionsText: string): string[] {
  const line = optionsText.split(/\r?\n/).find((entry) => entry.startsWith(`${PACKS_KEY}:`))
  if (!line) return []
  try {
    const parsed: unknown = JSON.parse(line.slice(PACKS_KEY.length + 1))
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

/** Returns options.txt with the resource pack list replaced (or added), keeping every other line as it was. */
export function writeResourcePacks(optionsText: string, packs: string[]): string {
  const newline = optionsText.includes('\r\n') ? '\r\n' : '\n'
  const value = `${PACKS_KEY}:${JSON.stringify(packs)}`
  const lines = optionsText.length > 0 ? optionsText.split(/\r?\n/) : []
  const index = lines.findIndex((entry) => entry.startsWith(`${PACKS_KEY}:`))
  if (index >= 0) lines[index] = value
  else {
    // Keep a trailing empty line at the end, as Minecraft writes it
    const insertAt = lines.length > 0 && lines[lines.length - 1] === '' ? lines.length - 1 : lines.length
    lines.splice(insertAt, 0, value)
  }
  return lines.join(newline)
}

/** The id Minecraft uses for a pack in the resourcepacks folder. */
export function resourcePackId(name: string): string {
  return `file/${name}`
}

/** Turns a pack on (last in the list, so it wins over the others) or off. */
export function toggleResourcePack(packs: string[], name: string, enabled: boolean): string[] {
  const id = resourcePackId(name)
  const without = packs.filter((entry) => entry !== id)
  if (!enabled) return without
  // Minecraft always keeps its built-in base pack; add it back if the list was empty
  const base = without.length === 0 ? ['vanilla'] : without
  return [...base, id]
}

/** `shaderPack` from Oculus/Iris properties, or null when shaders are off or the file does not say. */
export function readActiveShader(propertiesText: string): string | null {
  const values = new Map<string, string>()
  for (const line of propertiesText.split(/\r?\n/)) {
    const match = /^\s*([\w.]+)\s*=\s*(.*)$/.exec(line)
    if (match) values.set(match[1], match[2].trim())
  }
  if (values.get('enableShaders') === 'false') return null
  const pack = values.get('shaderPack')
  return pack ? pack.replace(/\\(.)/g, '$1') : null
}

/** Sets the active shader pack (or turns shaders off with null), keeping the other properties. */
export function writeActiveShader(propertiesText: string, pack: string | null): string {
  const newline = propertiesText.includes('\r\n') ? '\r\n' : '\n'
  const escape = (value: string): string => value.replace(/([\\:=])/g, '\\$1')
  const updates: Record<string, string> = pack === null ? { enableShaders: 'false' } : { enableShaders: 'true', shaderPack: escape(pack) }
  const lines = propertiesText.length > 0 ? propertiesText.split(/\r?\n/) : []
  const seen = new Set<string>()
  const next = lines.map((line) => {
    const key = /^\s*([\w.]+)\s*=/.exec(line)?.[1]
    if (key && key in updates) {
      seen.add(key)
      return `${key}=${updates[key]}`
    }
    return line
  })
  for (const [key, value] of Object.entries(updates)) if (!seen.has(key)) next.push(`${key}=${value}`)
  return next.join(newline)
}
