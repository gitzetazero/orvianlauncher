const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** Width and height from a PNG header, or null when the bytes are not a PNG. */
export function readPngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null
  if (!SIGNATURE.every((value, index) => bytes[index] === value)) return null
  // The first chunk must be IHDR: length (4 bytes), type "IHDR", then width and height big-endian
  if (String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]) !== 'IHDR') return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

/** Minecraft accepts 64×64 skins and the legacy 64×32 layout. */
export function isMinecraftSkinSize(size: { width: number; height: number } | null): boolean {
  return size !== null && size.width === 64 && (size.height === 64 || size.height === 32)
}
