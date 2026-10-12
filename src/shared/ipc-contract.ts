import type { GameOptions, LauncherState } from './launcher-state'

/** Shape of `window.orvian`: the only bridge between the windows and the main process. */

export type FolderKind = 'mods' | 'shaders' | 'resourcepacks' | 'screenshots' | 'logs' | 'game' | 'crash-reports'
export type ModPlatform = 'modrinth' | 'curseforge'

export interface InstalledMod {
  filename: string
  isOfficial: boolean
  size: number
  dependencies: string[]
  requiredBy: string[]
  projectId?: string
  platform?: ModPlatform
}

export interface ModSearchHit {
  project_id: string
  title: string
  description: string
  icon_url: string
  author: string
  downloads?: number
}

export interface ModInstallResult {
  ok: boolean
  filename: string
  dependencies?: string[]
  failedDependencies?: string[]
}

export interface ScreenshotItem {
  file: string
  size: number
  /** Epoch milliseconds, from the file's modification time. */
  takenAt: number
  /** Small preview served by the launcher (`orvian-media://`). */
  thumbUrl: string
  url: string
}

export type PackKind = 'resourcepacks' | 'shaderpacks'

export interface PackItem {
  name: string
  size: number
  modifiedAt: number
  isFolder: boolean
  enabled: boolean
  /** Ships with the modpack: it cannot be removed, replaced or switched from the launcher. */
  isOfficial: boolean
}

export interface PackList {
  items: PackItem[]
  /** False when the game has no file the launcher can use to switch packs (e.g. no shader mod config yet). */
  canToggle: boolean
}

export type SkinVariant = 'classic' | 'slim'

export interface SkinProfile {
  name: string
  skin: { url: string; variant: SkinVariant } | null
  capes: Array<{ id: string; alias: string; url: string; active: boolean }>
}

export interface SkinLibraryItem {
  id: string
  name: string
  variant: SkinVariant
  url: string
  addedAt: number
  favorite: boolean
}

/** A skin the account wore while the launcher was watching. */
export interface SkinHistoryItem {
  hash: string
  variant: SkinVariant
  url: string
  firstSeenAt: number
  lastSeenAt: number
  /** The skin the account wears now. */
  current: boolean
  /** Who knows this skin: this launcher and the public histories of LabyNet and Crafty.gg. */
  sources: Array<'launcher' | 'crafty' | 'labynet' | 'namemc'>
}

export interface OrvianApi {
  // Launcher state, pushed by the main process
  getState(): Promise<LauncherState>
  onState(callback: (state: LauncherState) => void): () => void
  dismissError(): Promise<void>
  refreshServer(): Promise<void>
  /** Copies a redacted support report to the clipboard. */
  copyDiagnostics(): Promise<{ ok: boolean; lines: number }>

  // Game and modpack
  checkForUpdates(): Promise<{
    configured: boolean
    hasUpdate: boolean
    installedVersion?: string | null
    latestVersion?: string | null
    message: string
    offline?: boolean
    /** Estimated download size of the update, when there is one. */
    downloadBytes?: number
  }>
  repair(): Promise<{ ok: boolean; message: string }>
  play(options?: { quickPlay?: boolean; playInstalled?: boolean }): Promise<{ ok: boolean; message: string }>
  /** Ends the game process only; the launcher stays open. */
  killGame(): Promise<void>
  /** Pack defaults that were not applied because the player had edited those config files. */
  pendingConfigs(): Promise<{ files: string[] }>
  restorePendingConfigs(): Promise<{ restored: number }>
  discardPendingConfigs(): Promise<void>

  // Account and settings
  login(): Promise<{ ok: boolean; message: string; cancelled?: boolean }>
  /** Closes the Microsoft sign-in window if one is open. */
  cancelLogin(): Promise<{ ok: boolean }>
  logout(): Promise<{ ok: boolean }>
  setRam(gb: number): Promise<{ ok: boolean }>
  openFolder(kind: FolderKind): Promise<{ ok: boolean; error: string }>
  /** Wipes launcher data. Worlds, screenshots, packs and options are kept unless `deleteWorlds` is true. */
  resetInstallation(options?: { deleteWorlds: boolean }): Promise<{ ok: boolean; message: string; preserved: string[] }>
  openExternal(url: string): Promise<void>

  // Admin
  pickMrpack(): Promise<{ canceled: boolean; selectionId: string | null; fileName: string | null; size: number }>
  /** `minimumLauncher` is carried over from the published manifest unless given; raise it only when the pack needs a newer launcher. */
  publishUpdate(params: { selectionId: string; version: string; changelog: string; overwrite?: boolean; minimumLauncher?: string }): Promise<{ ok: boolean; releaseUrl: string; message: string }>
  onPublishProgress(callback: (event: { state: string; progress: number; detail: string }) => void): () => void
  /** The publishing token lives only in the main process; the renderer can never read it back. */
  adminTokenStatus(): Promise<{ hasToken: boolean; canEncrypt: boolean }>
  adminSetToken(token: string): Promise<{ ok: boolean; verified: boolean }>
  adminClearToken(): Promise<{ ok: boolean }>

  // Mods
  listMods(): Promise<InstalledMod[]>
  deleteMod(filename: string): Promise<{ ok: boolean }>
  searchModrinth(query: string): Promise<{ hits: ModSearchHit[] }>
  installModrinth(projectId: string): Promise<ModInstallResult>
  searchCurseForge(query: string): Promise<{ hits: ModSearchHit[] }>
  installCurseForge(modId: string | number): Promise<ModInstallResult>

  // Advanced launch options
  setGameOptions(options: GameOptions): Promise<{ ok: boolean }>

  // Screenshots
  listScreenshots(): Promise<ScreenshotItem[]>
  openScreenshot(file: string): Promise<void>
  copyScreenshot(file: string): Promise<void>
  /** Moves the file to the recycle bin. */
  deleteScreenshot(file: string): Promise<void>

  // Resource packs and shaders
  listPacks(kind: PackKind): Promise<PackList>
  setPackEnabled(kind: PackKind, name: string, enabled: boolean): Promise<void>
  /** Opens a file picker and copies the chosen .zip files into the folder. */
  addPacks(kind: PackKind): Promise<{ added: string[]; skipped?: string[] }>
  deletePack(kind: PackKind, name: string): Promise<void>

  // Skins and capes (Locker)
  getSkinProfile(): Promise<SkinProfile>
  /** Public skin texture of any player (for avatars), or null when it cannot be found. */
  getSkinTexture(uuid: string): Promise<string | null>
  listSkins(): Promise<SkinLibraryItem[]>
  /** Opens a file picker for a PNG skin and adds it to the library. */
  importSkin(): Promise<{ canceled: boolean; item?: SkinLibraryItem }>
  /** Copies the skin the account wears now into the library. */
  saveCurrentSkin(): Promise<SkinLibraryItem>
  updateSkin(id: string, patch: { name?: string; variant?: SkinVariant; favorite?: boolean }): Promise<SkinLibraryItem>
  deleteSkin(id: string): Promise<void>
  /** Uploads a library skin to the Minecraft account. */
  applySkin(id: string): Promise<SkinProfile>
  setCape(capeId: string | null): Promise<SkinProfile>
  listSkinHistory(): Promise<SkinHistoryItem[]>
  /** Current skin of any Minecraft player, for the editor. */
  lookupSkin(name: string): Promise<{ name: string; url: string; variant: SkinVariant }>
  /** Adds a skin drawn in the editor (PNG data URL) to the wardrobe. */
  saveSkinPng(name: string, variant: SkinVariant, dataUrl: string): Promise<SkinLibraryItem>
  /** Merges the public skin histories (LabyNet, Crafty.gg) of the signed-in account. */
  syncSkinHistory(): Promise<void>
  /** Opens the account's NameMC profile in a window (the player passes its check if asked) and adds the skins it lists. */
  syncNameMcHistory(): Promise<{ found: number; added: number }>
  applySkinHistory(hash: string): Promise<SkinProfile>
  saveSkinHistory(hash: string): Promise<SkinLibraryItem>
  deleteSkinHistory(hash: string): Promise<void>

  // Notifications
  markNotificationsRead(): Promise<void>
  clearNotifications(): Promise<void>

  // Windows and application
  appReady(): Promise<void>
  minimizeWindow(): Promise<void>
  toggleMaximizeWindow(): Promise<boolean>
  isWindowMaximized(): Promise<boolean>
  closeWindow(): Promise<void>
  showMainWindow(): Promise<void>
  hideTrayWindow(): Promise<void>
  resizeTray(height: number): Promise<void>
  quitApp(): Promise<void>
  isMinecraftRunning(): Promise<boolean>
  forceQuit(): Promise<void>
  onPromptMcQuit(callback: () => void): () => void
  onWindowState(callback: (isMaximized: boolean) => void): () => void

  // Launcher self-update
  updaterCheck(): Promise<{ ok: boolean; message?: string }>
  updaterDownload(): Promise<{ ok: boolean; message?: string }>
  updaterInstall(): Promise<void>
}
