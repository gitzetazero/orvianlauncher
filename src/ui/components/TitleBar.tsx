import { useEffect, useState } from 'react'
import { Copy, Download, Minus, Moon, RotateCw, Square, X } from 'lucide-react'
import type { LauncherState, ServerStatus } from '../../shared/launcher-state'
import { IconButton } from './Button'
import { useToast } from './Toast'

const SERVER_LABEL: Record<ServerStatus['state'], string> = {
  unknown: 'Servidor sin comprobar',
  checking: 'Comprobando el servidor…',
  online: 'En línea',
  offline: 'Servidor sin conexión',
  sleeping: 'Servidor dormido',
  starting: 'Servidor despertando…'
}

function serverText(server: ServerStatus): string {
  if (server.state === 'online' && server.players) return `En línea · ${server.players.online}/${server.players.max} jugando`
  return SERVER_LABEL[server.state]
}

/** The window's own frame: who this is, the server pulse, the launcher's update, and the window buttons. */
export function TitleBar({ state }: { state: LauncherState }) {
  const [maximized, setMaximized] = useState(false)
  const toast = useToast()
  const { launcherUpdate: update, phase, server } = state
  const gameRunning = phase.kind === 'running' || phase.kind === 'launching'

  useEffect(() => {
    void window.orvian.isWindowMaximized().then(setMaximized).catch(() => undefined)
    return window.orvian.onWindowState((value) => setMaximized(value))
  }, [])

  const run = (action: () => Promise<unknown>): void => {
    action().catch(() => toast({ kind: 'error', message: 'No se pudo actualizar el launcher. Inténtalo de nuevo más tarde.' }))
  }

  return (
    <header className="topbar">
      <div className="topbar-meta">
        <span className="topbar-name" translate="no">Orvian <span>Launcher</span></span>
        <span className="topbar-sep" aria-hidden="true" />
        <span className="topbar-version" translate="no">v{state.appVersion}</span>
        <span className="topbar-sep" aria-hidden="true" />
        <span className="topbar-server" data-state={server.state}>
          {server.state === 'sleeping' ? <Moon size={12} strokeWidth={2} aria-hidden="true" /> : <span className="status-dot" aria-hidden="true" />}
          {serverText(server)}
        </span>
      </div>

      <div className="topbar-actions" role="status">
        {update.status === 'available' && (
          <button type="button" className="topbar-chip" onClick={() => run(() => window.orvian.updaterDownload())}>
            <Download size={14} strokeWidth={2} aria-hidden="true" />
            Descargar launcher v{update.newVersion}
          </button>
        )}
        {update.status === 'downloading' && <span className="topbar-note">Descargando el launcher… {update.percent ?? 0} %</span>}
        {update.status === 'downloaded' && (
          <button type="button" className="topbar-chip" disabled={gameRunning} title={gameRunning ? 'Se instalará al cerrar Minecraft' : undefined} onClick={() => run(async () => window.orvian.updaterInstall())}>
            <RotateCw size={14} strokeWidth={2} aria-hidden="true" />
            {gameRunning ? `v${update.newVersion} lista al cerrar Minecraft` : `Reiniciar con v${update.newVersion}`}
          </button>
        )}
        {update.status === 'error' && (
          <button type="button" className="topbar-chip topbar-chip-quiet" onClick={() => run(() => window.orvian.updaterCheck())}>
            No se pudo comprobar el launcher · Reintentar
          </button>
        )}
      </div>

      <div className="topbar-controls">
        <IconButton label="Minimizar" className="window-btn" onClick={() => void window.orvian.minimizeWindow()}>
          <Minus size={16} strokeWidth={1.75} aria-hidden="true" />
        </IconButton>
        <IconButton label={maximized ? 'Restaurar' : 'Maximizar'} className="window-btn" onClick={() => void window.orvian.toggleMaximizeWindow().then(setMaximized)}>
          {maximized ? <Copy size={14} strokeWidth={1.75} aria-hidden="true" /> : <Square size={13} strokeWidth={1.75} aria-hidden="true" />}
        </IconButton>
        <IconButton label="Ocultar en la bandeja del sistema" className="window-btn window-close" onClick={() => void window.orvian.closeWindow()}>
          <X size={16} strokeWidth={1.75} aria-hidden="true" />
        </IconButton>
      </div>
    </header>
  )
}
