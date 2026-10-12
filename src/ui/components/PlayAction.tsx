import { useEffect, useState, type CSSProperties } from 'react'
import { ChevronDown, FolderOpen, Play, Wrench } from 'lucide-react'
import { getPrimaryAction, type LauncherState, type PrimaryActionId } from '../../shared/launcher-state'
import { formatDuration } from '../../shared/format'
import { useDelayedFlag } from '../hooks/useDelayedFlag'
import { Button } from './Button'
import { Menu } from './Menu'
import { ProgressBar } from './ProgressBar'

interface PlayActionProps {
  state: LauncherState
  onAction: (action: PrimaryActionId) => void
  onPlayWithoutServer: () => void
  onRepair: () => void
  onKill: () => void
}

type Tone = 'ready' | 'login' | 'working' | 'running' | 'busy' | 'idle'

/** Colour of the launch block: gold to act, green while it installs or plays, quiet while it waits. */
function toneOf(state: LauncherState, enabled: boolean): Tone {
  const kind = state.phase.kind
  if (kind === 'installing' || kind === 'repairing') return 'working'
  if (kind === 'running') return 'running'
  if (kind === 'launching' || kind === 'checking' || kind === 'booting' || kind === 'signing-in') return 'busy'
  if (kind === 'signed-out' || kind === 'session-expired') return 'login'
  return enabled ? 'ready' : 'idle'
}

/** The four squares of the Microsoft sign-in mark, drawn rather than loaded. */
function MicrosoftMark() {
  return (
    <svg className="ms-mark" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <rect x="0" y="0" width="9.5" height="9.5" fill="#f25022" />
      <rect x="10.5" y="0" width="9.5" height="9.5" fill="#7fba00" />
      <rect x="0" y="10.5" width="9.5" height="9.5" fill="#00a4ef" />
      <rect x="10.5" y="10.5" width="9.5" height="9.5" fill="#ffb900" />
    </svg>
  )
}

/** The one big button. Its text and behaviour come from `getPrimaryAction`, shared with the tray. */
export function PlayAction({ state, onAction, onPlayWithoutServer, onRepair, onKill }: PlayActionProps) {
  const { phase } = state
  const primary = getPrimaryAction(state)
  const working = phase.kind === 'installing' || phase.kind === 'repairing'
  const fraction = working ? phase.progress.fraction : 0
  const indeterminate = useDelayedFlag(phase.kind === 'launching' || phase.kind === 'checking')
  const elapsed = useElapsed(phase.kind === 'running' ? phase.startedAt : null)
  const canPlay = primary.enabled && (primary.action === 'play' || primary.action === 'play-installed')
  const idle = !working && phase.kind !== 'launching' && phase.kind !== 'running' && phase.kind !== 'signing-in' && phase.kind !== 'booting'
  const tone = toneOf(state, primary.enabled)
  // The extra actions are about the game; without an account there is nothing to offer there
  const showMenu = state.account !== null
  const hasBar = showMenu || Boolean(primary.secondary)

  return (
    <div className="launch" data-tone={tone}>
      <button
        type="button"
        className={hasBar ? 'play-btn' : 'play-btn play-btn-solo'}
        disabled={!primary.enabled}
        aria-busy={working || phase.kind === 'launching' || undefined}
        style={{ '--fill': Math.min(1, Math.max(0, fraction)) } as CSSProperties}
        onClick={() => onAction(primary.action)}
      >
        <span className="play-fill" aria-hidden="true" />
        <span key={primary.label} className={primary.label.length > 12 ? 'play-label play-label-long' : 'play-label'}>
          {canPlay && <Play size={22} strokeWidth={2.25} fill="currentColor" aria-hidden="true" className="play-icon" />}
          {tone === 'login' && <MicrosoftMark />}
          {primary.label}
        </span>
        <span className="play-sub">{elapsed !== null ? `En juego · ${formatDuration(elapsed)}` : primary.sublabel}</span>
        {(working || indeterminate) && (
          <ProgressBar className="play-progress" label={working ? 'Progreso de la instalación' : 'Abriendo Minecraft'} value={working ? fraction : undefined} />
        )}
      </button>

      {hasBar && (
        <div className="launch-bar">
          {showMenu && (
            <Menu
              label="Más opciones"
              textTrigger
              align="stretch"
              className="launch-menu"
              triggerClassName="launch-more"
              trigger={
                <>
                  <span>Más opciones</span>
                  <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
                </>
              }
              items={[
                { label: 'Jugar sin entrar al servidor', icon: <Play size={16} strokeWidth={1.75} aria-hidden="true" />, disabled: !canPlay, onSelect: onPlayWithoutServer },
                { label: 'Reparar ahora', icon: <Wrench size={16} strokeWidth={1.75} aria-hidden="true" />, disabled: !idle, onSelect: onRepair },
                { label: 'Abrir la carpeta de mods', icon: <FolderOpen size={16} strokeWidth={1.75} aria-hidden="true" />, onSelect: () => void window.orvian.openFolder('mods') }
              ]}
            />
          )}
          {primary.secondary && (
            <Button
              size="sm"
              variant="ghost"
              className="launch-secondary"
              onClick={() => (primary.secondary?.action === 'force-quit' ? onKill() : onAction(primary.secondary?.action ?? 'none'))}
            >
              {primary.secondary.label}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

/** Seconds since `startedAt`, ticking once a second; null when not applicable. */
function useElapsed(startedAt: number | null): number | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (startedAt === null) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [startedAt])
  return startedAt === null ? null : Math.max(0, (now - startedAt) / 1000)
}
