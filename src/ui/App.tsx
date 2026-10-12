import { useEffect, useState } from 'react'
import { Dialog, ConfirmDialog } from './components/Dialog'
import { Button } from './components/Button'
import { WifiOff } from 'lucide-react'
import { NavRail, type ViewId } from './components/NavRail'
import { ProgressBar } from './components/ProgressBar'
import { TitleBar } from './components/TitleBar'
import { ToastProvider } from './components/Toast'
import { cx } from './components/cx'
import { useLauncherState } from './hooks/useLauncherState'
import type { LauncherState } from '../shared/launcher-state'
import Admin from './views/Admin'
import Gallery from './views/Gallery'
import Home from './views/Home'
import Locker from './views/Locker'
import Mods from './views/Mods'
import Packs from './views/Packs'
import SkinEditor from './views/SkinEditor'
import Settings from './views/Settings'

export default function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  )
}

function Shell() {
  const state = useLauncherState()
  const [view, setView] = useState<ViewId>('home')
  const [quitPrompt, setQuitPrompt] = useState(false)

  // The main process keeps the splash up until the launcher state is loaded, then shows this window.
  useEffect(() => {
    void window.orvian.appReady()
    return window.orvian.onPromptMcQuit(() => setQuitPrompt(true))
  }, [])

  // The admin view disappears with the account; do not stay on a screen that no longer exists
  const isAdmin = state?.isAdmin ?? false
  useEffect(() => {
    if (view === 'admin' && !isAdmin) setView('home')
  }, [view, isAdmin])

  // After signing out, signing in again starts from the home screen
  const hasAccount = state?.account != null
  useEffect(() => {
    if (!hasAccount) setView('home')
  }, [hasAccount])

  if (!state) return <div className="app" aria-busy="true" />

  const gameBusy = state.phase.kind === 'running' || state.phase.kind === 'launching'
  // Without an account the launcher is only its sign-in screen, as in the reference
  const signedOut = state.account === null

  return (
    <div className={cx('app', signedOut && 'app-signedout')}>
      <a href="#content" className="skip-link" onClick={(event) => { event.preventDefault(); document.getElementById('content')?.focus() }}>Saltar al contenido</a>
      {!signedOut && <NavRail view={view} isAdmin={isAdmin} notifications={state.notifications} onNavigate={setView} />}
      <div className="app-frame">
        <TitleBar state={state} />
        {state.pack.offline && (
          <p className="offline-banner" role="status">
            <WifiOff size={14} strokeWidth={2} aria-hidden="true" />
            {state.pack.installed
              ? `Sin conexión: no se pudo consultar el modpack. Puedes jugar con la versión instalada (v${state.pack.installed}).`
              : 'Sin conexión: no se pudo consultar el modpack. Conéctate para instalar Orvian.'}
          </p>
        )}
        <main id="content" className="app-main" tabIndex={-1}>
          {(signedOut || view === 'home') && <Home state={state} onNavigate={setView} />}
          {!signedOut && view === 'locker' && <Locker state={state} />}
          {!signedOut && view === 'editor' && <SkinEditor />}
          {!signedOut && view === 'mods' && <Mods gameBusy={gameBusy} />}
          {!signedOut && view === 'packs' && <Packs gameBusy={gameBusy} />}
          {!signedOut && view === 'gallery' && <Gallery />}
          {!signedOut && view === 'settings' && <Settings state={state} />}
          {!signedOut && view === 'admin' && isAdmin && <Admin state={state} />}
        </main>
      </div>

      <LauncherUpdateRequired state={state} />
      <ConfirmDialog
        open={quitPrompt}
        destructive
        title="Minecraft sigue abierto"
        description="No se puede cerrar el launcher dejando Minecraft abierto en segundo plano. ¿Quieres cerrar Minecraft y salir de Orvian? Se perderá lo que no se haya guardado."
        confirmLabel="Cerrar Minecraft y salir"
        onCancel={() => setQuitPrompt(false)}
        onConfirm={() => {
          setQuitPrompt(false)
          void window.orvian.forceQuit()
        }}
      />
    </div>
  )
}

/** Blocks the app only when the published pack needs a newer launcher than this one. */
function LauncherUpdateRequired({ state }: { state: LauncherState }) {
  const { phase, launcherUpdate: update } = state
  const open = phase.kind === 'launcher-update-required'
  const [busy, setBusy] = useState(false)

  const start = async (): Promise<void> => {
    setBusy(true)
    try {
      if (update.status === 'downloaded') await window.orvian.updaterInstall()
      else {
        await window.orvian.updaterCheck()
        await window.orvian.updaterDownload()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      dismissible={false}
      title="Actualiza el launcher para jugar"
      description={phase.kind === 'launcher-update-required' ? `La versión actual del modpack requiere Orvian Launcher ${phase.required} o superior. Tienes la ${state.appVersion}.` : undefined}
      onClose={() => undefined}
      actions={
        <>
          <Button variant="secondary" onClick={() => void window.orvian.quitApp()}>Salir</Button>
          <Button variant="primary" data-autofocus="" loading={busy || update.status === 'downloading'} onClick={() => void start()}>
            {update.status === 'downloaded' ? 'Reiniciar y actualizar' : 'Descargar la actualización'}
          </Button>
        </>
      }
    >
      {update.status === 'downloading' && <ProgressBar label="Descarga del launcher" value={(update.percent ?? 0) / 100} />}
      {update.status === 'error' && <p className="field-error" role="alert">No se pudo descargar la actualización. Inténtalo de nuevo.</p>}
    </Dialog>
  )
}
