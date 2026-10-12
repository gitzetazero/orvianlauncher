import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { AlertTriangle, ChevronDown, Clock3, Download, ExternalLink, FolderOpen, Image, Layers, LogOut, Moon, Package, PackageCheck, RefreshCw, Settings, Shirt, Signal, Sunrise, WifiOff } from 'lucide-react'
import { ConfirmDialog, Dialog } from '../components/Dialog'
import { Button, IconButton } from '../components/Button'
import { ErrorPanel } from '../components/ErrorPanel'
import { InstallSteps } from '../components/InstallSteps'
import { Menu } from '../components/Menu'
import { NewsList } from '../components/NewsList'
import { Avatar } from '../components/Avatar'
import type { ViewId } from '../components/NavRail'
import { PlayAction } from '../components/PlayAction'
import { formatPlayTime, relativeTime } from '../components/time'
import { useToast } from '../components/Toast'
import { cx } from '../components/cx'
import { useLauncherActions } from '../hooks/useLauncherActions'
import type { ScreenshotItem } from '../../shared/ipc-contract'
import type { LauncherState, ServerStatus } from '../../shared/launcher-state'
import { formatBytes } from '../../shared/format'

const STEP_ANNOUNCEMENTS = {
  java: 'Preparando Java',
  minecraft: 'Preparando Minecraft',
  forge: 'Instalando Forge',
  libraries: 'Verificando bibliotecas y recursos',
  modpack: 'Instalando el modpack',
  finalizing: 'Iniciando el juego'
} as const

const PACK_REPO_URL = 'https://github.com/gitzetazero/orvianmodpack'

/** The player's own latest captures, newest first: the hero and the news cards are painted with them. */
function useCaptures(): ScreenshotItem[] {
  const [items, setItems] = useState<ScreenshotItem[]>([])
  useEffect(() => {
    let cancelled = false
    const load = (): void => {
      window.orvian.listScreenshots().then((list) => !cancelled && setItems(list.slice(0, 6)), () => undefined)
    }
    load()
    // A capture taken in game (F2) shows up as soon as the player comes back to the launcher
    window.addEventListener('focus', load)
    return () => {
      cancelled = true
      window.removeEventListener('focus', load)
    }
  }, [])
  return items
}

export default function Home({ state, onNavigate }: { state: LauncherState; onNavigate: (view: ViewId) => void }) {
  const { phase } = state
  const captures = useCaptures()
  const { perform, performErrorAction } = useLauncherActions()
  const toast = useToast()
  const [killOpen, setKillOpen] = useState(false)

  const working = phase.kind === 'installing' || phase.kind === 'repairing'
  const announcement = useStepAnnouncement(working ? phase.progress.step : null)
  const signedOut = state.account === null

  const playWithoutServer = (): void => {
    window.orvian.play({ playInstalled: state.pack.offline }).catch(() => toast({ kind: 'error', message: 'No se pudo iniciar el juego.' }))
  }

  const launch = (
    <PlayAction
      state={state}
      onAction={(action) => void perform(action)}
      onPlayWithoutServer={playWithoutServer}
      onRepair={() => void perform('repair')}
      onKill={() => setKillOpen(true)}
    />
  )

  return (
    <div className={cx('home view-enter', signedOut && 'home-signedout')}>
      {signedOut ? (
        <SignIn state={state} launch={launch} captures={captures} error={phase.kind === 'error' ? <ErrorPanel error={phase.error} onAction={(action) => void performErrorAction(action)} onDismiss={() => void window.orvian.dismissError()} /> : null} />
      ) : (
        <div className="home-layout">
          <div className="home-main">
            <Hero state={state} launch={launch} onNavigate={onNavigate} image={captures[0]?.url ?? null} />
            {phase.kind === 'error' && <ErrorPanel error={phase.error} onAction={(action) => void performErrorAction(action)} onDismiss={() => void window.orvian.dismissError()} />}
            <NewsList items={state.news} latest={state.pack.latest} installed={state.pack.installed} images={captures.map((capture) => capture.thumbUrl)} />
          </div>
          <SidePanel state={state} />
        </div>
      )}

      <div className="visually-hidden" role="status">{announcement}</div>

      <ConfirmDialog
        open={killOpen}
        destructive
        title="¿Forzar el cierre de Minecraft?"
        description="Se cerrará el juego al instante. Los cambios del mundo que no se hayan guardado se perderán."
        confirmLabel="Forzar cierre"
        onCancel={() => setKillOpen(false)}
        onConfirm={() => {
          setKillOpen(false)
          void perform('force-quit')
        }}
      />

      <CrashDialog state={state} />
    </div>
  )
}

/**
 * The backdrop behind the hero: the player's latest capture under a purple wash and a vignette, as in
 * the reference. Without captures it falls back to a drawn night sky over a block floor.
 */
function Scene({ className, image }: { className?: string; image?: string | null }) {
  return (
    <div className={cx('scene', image && 'scene-photo', className)} aria-hidden="true">
      {image && <img className="scene-image" src={image} alt="" width={1920} height={1080} decoding="async" />}
      <span className="scene-glow scene-glow-gold" />
      <span className="scene-glow scene-glow-steel" />
      <span className="scene-stars" />
      <span className="scene-blocks" />
    </div>
  )
}

/** Without an account: Noctra-style split screen, the sign-in on the left and the latest release on the right. */
function SignIn({ state, launch, captures, error }: { state: LauncherState; launch: ReactNode; captures: ScreenshotItem[]; error: ReactNode }) {
  const expired = state.phase.kind === 'session-expired'
  return (
    <div className="signin">
      <section className="signin-panel stagger" aria-labelledby="home-title">
        <img className="signin-logo" src="./logo-256.png" alt="" width={84} height={84} draggable={false} style={{ '--i': 0 } as CSSProperties} />
        <h1 id="home-title" className="signin-title" translate="no" style={{ '--i': 1 } as CSSProperties}>
          Orvian
        </h1>
        <p className="signin-lead" style={{ '--i': 2 } as CSSProperties}>
          {expired ? 'Tu sesión ha caducado. Vuelve a entrar con tu cuenta de Microsoft.' : 'Instala el modpack, lo mantiene al día y te deja dentro del servidor con un clic.'}
        </p>
        <div className="signin-action" style={{ '--i': 3 } as CSSProperties}>{launch}</div>
        {error}
        <Button
          variant="secondary"
          className="signin-secondary"
          style={{ '--i': 4 } as CSSProperties}
          icon={<ExternalLink size={15} strokeWidth={1.75} aria-hidden="true" />}
          onClick={() => void window.orvian.openExternal(PACK_REPO_URL)}
        >
          Ver código en GitHub
        </Button>
        <p className="signin-note" style={{ '--i': 5 } as CSSProperties}>Inicias sesión en la página oficial de Microsoft: el launcher nunca ve tu contraseña.</p>
      </section>
      <div className="signin-art">
        <Scene className="scene-full" image={captures[0]?.url ?? null} />
        {captures.length === 0 && <img className="signin-emblem" src="./logo-256.png" alt="" width={256} height={256} draggable={false} />}
        <div className="signin-news">
          <NewsList items={state.news.slice(0, 1)} latest={state.pack.latest} installed={state.pack.installed} images={captures.slice(1).map((capture) => capture.thumbUrl)} />
        </div>
      </div>
    </div>
  )
}

function Hero({ state, launch, onNavigate, image }: { state: LauncherState; launch: ReactNode; onNavigate: (view: ViewId) => void; image: string | null }) {
  const { pack, phase, stats, account } = state
  const working = phase.kind === 'installing' || phase.kind === 'repairing'
  const toast = useToast()

  return (
    <section className="hero" aria-labelledby="home-title">
      <Scene image={image} />
      <h1 id="home-title" className="visually-hidden" translate="no">Orvian</h1>
      <div className="hero-top stagger">
        {account && (
          <div className="greeting" style={{ '--i': 0 } as CSSProperties}>
            <span>Qué bien verte,</span>
            <Menu
              label={`Cuenta de ${account.name}`}
              textTrigger
              align="start"
              className="greeting-menu"
              triggerClassName="greeting-trigger"
              trigger={
                <>
                  <Avatar uuid={account.uuid} name={account.name} size={20} />
                  <strong translate="no">{account.name}</strong>
                  <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
                </>
              }
              items={[
                { label: 'Cambiar mi skin', icon: <Shirt size={16} strokeWidth={1.75} aria-hidden="true" />, onSelect: () => onNavigate('locker') },
                { label: 'Ajustes de la cuenta', icon: <Settings size={16} strokeWidth={1.75} aria-hidden="true" />, onSelect: () => onNavigate('settings') },
                {
                  label: 'Cerrar sesión',
                  icon: <LogOut size={16} strokeWidth={1.75} aria-hidden="true" />,
                  disabled: working || phase.kind === 'running' || phase.kind === 'launching',
                  onSelect: () => void window.orvian.logout().then(() => toast({ kind: 'info', message: 'Sesión cerrada.' }))
                }
              ]}
            />
          </div>
        )}
        <dl className="hero-stats" style={{ '--i': 1 } as CSSProperties}>
          {stats.lastPlayedAt ? (
            <>
              <div><dt>Última partida:</dt><dd>Orvian · {relativeTime(stats.lastPlayedAt)}</dd></div>
              <div><dt>Tiempo de juego total:</dt><dd>{formatPlayTime(stats.totalSeconds)}</dd></div>
            </>
          ) : (
            <div><dt><Clock3 size={12} strokeWidth={2} aria-hidden="true" /></dt><dd className="hero-stats-empty">Tu tiempo de juego aparecerá tras tu primera partida.</dd></div>
          )}
        </dl>
      </div>

      <div className="hero-row stagger">
        <div className="hero-launch" style={{ '--i': 2 } as CSSProperties}>{launch}</div>

        {working ? (
          <div className="hero-block hero-install" style={{ '--i': 3 } as CSSProperties}>
            <h2 className="section-label">Instalación</h2>
            <InstallSteps progress={phase.progress} />
            <p className="install-note">Puedes cerrar esta ventana: seguiremos en segundo plano.</p>
          </div>
        ) : (
          <>
            <div className="hero-block" style={{ '--i': 3 } as CSSProperties}>
              <h2 className="section-label">Versiones</h2>
              <ul className="profile-list">
                <li className="profile">
                  <span className="profile-icon" aria-hidden="true"><PackageCheck size={16} strokeWidth={1.75} /></span>
                  <span className="profile-text">
                    <span className="profile-name" translate="no">{pack.installed ? `Orvian v${pack.installed}` : 'Sin instalar'}</span>
                    <span className="profile-sub">{pack.installed ? 'Instalado · Forge 1.20.1' : 'Se instalará al jugar'}</span>
                  </span>
                </li>
                {pack.latest && pack.hasUpdate && (
                  <li className="profile profile-new">
                    <span className="profile-icon" aria-hidden="true"><Download size={16} strokeWidth={1.75} /></span>
                    <span className="profile-text">
                      <span className="profile-name" translate="no">Orvian v{pack.latest}</span>
                      <span className="profile-sub">Disponible{pack.downloadBytes ? ` · ${formatBytes(pack.downloadBytes)}` : ''}</span>
                    </span>
                  </li>
                )}
                {pack.latest && !pack.hasUpdate && pack.installed && (
                  <li className="profile">
                    <span className="profile-icon" aria-hidden="true"><Package size={16} strokeWidth={1.75} /></span>
                    <span className="profile-text">
                      <span className="profile-name">Al día</span>
                      <span className="profile-sub" translate="no">Última versión publicada v{pack.latest}</span>
                    </span>
                  </li>
                )}
              </ul>
            </div>
            <div className="hero-block" style={{ '--i': 4 } as CSSProperties}>
              <h2 className="section-label">Accesos directos</h2>
              <ul className="tile-grid">
                <Tile label="Cambiar de skin" onClick={() => onNavigate('locker')}><Shirt size={18} strokeWidth={1.75} aria-hidden="true" /></Tile>
                <Tile label="Ver capturas" onClick={() => onNavigate('gallery')}><Image size={18} strokeWidth={1.75} aria-hidden="true" /></Tile>
                <Tile label="Resource packs y shaders" onClick={() => onNavigate('packs')}><Layers size={18} strokeWidth={1.75} aria-hidden="true" /></Tile>
                <Tile label="Carpeta del juego" onClick={() => void window.orvian.openFolder('game')}><FolderOpen size={18} strokeWidth={1.75} aria-hidden="true" /></Tile>
              </ul>
            </div>
          </>
        )}
      </div>
    </section>
  )
}

function Tile({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <li>
      <button type="button" className="tile" aria-label={label} title={label} onClick={onClick}>
        {children}
      </button>
    </li>
  )
}

const SERVER_STATE: Record<ServerStatus['state'], { label: string; tone: string; title: string; text: string }> = {
  unknown: { label: 'Sin comprobar', tone: 'muted', title: 'Aún no sabemos nada', text: 'El launcher comprobará el servidor en unos segundos.' },
  checking: { label: 'Comprobando', tone: 'warning', title: 'Comprobando el servidor', text: 'Un momento: estamos preguntando al servidor cómo está.' },
  online: { label: 'En línea', tone: 'success', title: '', text: '' },
  offline: { label: 'Sin conexión', tone: 'danger', title: 'No responde', text: 'No se pudo contactar con el servidor. Comprueba tu conexión e inténtalo de nuevo.' },
  sleeping: { label: 'Dormido', tone: 'info', title: 'El servidor está dormido', text: 'Duerme para ahorrar recursos. Se despierta al pulsar Jugar: tarda cerca de un minuto y esperarás en una sala de espera.' },
  starting: { label: 'Despertando', tone: 'warning', title: 'Despertando el servidor', text: 'Está arrancando. Puedes pulsar Jugar: entrarás en cuanto esté listo.' }
}

const STATE_ICON: Record<Exclude<ServerStatus['state'], 'online'>, ReactNode> = {
  unknown: <Signal size={22} strokeWidth={1.75} />,
  checking: <Signal size={22} strokeWidth={1.75} />,
  offline: <WifiOff size={22} strokeWidth={1.75} />,
  sleeping: <Moon size={22} strokeWidth={1.75} />,
  starting: <Sunrise size={22} strokeWidth={1.75} />
}

/** How good the connection is, as four bars. */
function latencyBars(ms: number): { bars: number; label: string; tone: string } {
  if (ms < 60) return { bars: 4, label: 'Excelente', tone: 'success' }
  if (ms < 120) return { bars: 3, label: 'Buena', tone: 'success' }
  if (ms < 200) return { bars: 2, label: 'Aceptable', tone: 'warning' }
  return { bars: 1, label: 'Lenta', tone: 'danger' }
}

/** One server check, as remembered for the activity chart. */
interface ServerSample {
  at: number
  state: ServerStatus['state']
  players?: number
  max?: number
  ms?: number
}

const HISTORY_KEY = 'orvian.server.history'
const HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000
const CHART_SAMPLES = 36

function readSamples(): ServerSample[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is ServerSample => typeof (item as ServerSample | null)?.at === 'number' && typeof (item as ServerSample | null)?.state === 'string' && Date.now() - (item as ServerSample).at < HISTORY_WINDOW_MS)
  } catch {
    return []
  }
}

/** Every answer the launcher gets from the server over the last day, kept on this computer. */
function useServerHistory(server: ServerStatus): ServerSample[] {
  const [samples, setSamples] = useState<ServerSample[]>(readSamples)
  const latest = useRef(server)
  latest.current = server
  const { checkedAt, state } = server
  useEffect(() => {
    if (!checkedAt || state === 'checking' || state === 'unknown') return
    const answer = latest.current
    setSamples((list) => {
      if (list.some((item) => item.at === checkedAt)) return list
      const sample: ServerSample = { at: checkedAt, state, players: answer.players?.online, max: answer.players?.max, ms: state === 'online' ? answer.latencyMs : undefined }
      const next = [...list, sample].filter((item) => checkedAt - item.at < HISTORY_WINDOW_MS)
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
      } catch {
        // Without storage the chart simply covers this session
      }
      return next
    })
  }, [checkedAt, state])
  return samples
}

const timeOfDay = (at: number): string => new Date(at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

/** The right column: the Orvian server and nothing else, with what the launcher really knows about it. */
function SidePanel({ state }: { state: LauncherState }) {
  const { server } = state
  const status = SERVER_STATE[server.state]
  const online = server.state === 'online'
  const players = online ? server.players : undefined
  const latency = online && server.latencyMs !== undefined ? latencyBars(server.latencyMs) : null
  const samples = useServerHistory(server)

  const chart = samples.slice(-CHART_SAMPLES)
  const onlineSamples = samples.filter((item) => item.state === 'online')
  const peak = onlineSamples.reduce((best, item) => Math.max(best, item.players ?? 0), 0)
  const pings = onlineSamples.flatMap((item) => (item.ms === undefined ? [] : [item.ms]))
  const averagePing = pings.length ? Math.round(pings.reduce((sum, ms) => sum + ms, 0) / pings.length) : null
  const awake = samples.length ? Math.round((onlineSamples.length / samples.length) * 100) : null
  const scale = Math.max(1, peak)

  return (
    <aside className="side srv" aria-labelledby="srv-title">
      <header className="srv-head">
        <h2 id="srv-title" className="srv-title">Servidor</h2>
        <IconButton label="Comprobar el servidor ahora" onClick={() => void window.orvian.refreshServer()} disabled={server.state === 'checking'}>
          <RefreshCw size={15} strokeWidth={1.75} aria-hidden="true" className={server.state === 'checking' ? 'spin' : undefined} />
        </IconButton>
      </header>

      <section className="srv-card" data-tone={status.tone} aria-label={`Estado: ${status.label}`}>
        <div className="srv-identity">
          <img src="./logo-64.png" alt="" width={40} height={40} draggable={false} />
          <div className="srv-identity-text">
            <p className="srv-name" translate="no">Orvian</p>
            <p className="srv-sub" translate="no">{online && server.version ? server.version : 'Minecraft 1.20.1 · Forge'}</p>
          </div>
          <span className="srv-pill" data-tone={status.tone}>
            <span className="status-dot" aria-hidden="true" />
            {status.label}
          </span>
        </div>

        {online ? (
          players ? (
            <div className="srv-players">
              <p className="srv-count" translate="no">
                <strong>{players.online}</strong>
                <span>de {players.max} jugadores</span>
              </p>
              <div className="srv-meter" role="img" aria-label={`${players.online} de ${players.max} jugadores conectados`}>
                <span style={{ transform: `scaleX(${players.max > 0 ? Math.min(1, players.online / players.max) : 0})` }} />
              </div>
              <p className="srv-note">{players.online === 0 ? 'Nadie conectado ahora mismo: sé el primero.' : players.online === 1 ? 'Hay alguien jugando ahora.' : 'Conectados ahora mismo.'}</p>
            </div>
          ) : (
            <p className="srv-note">En línea. El servidor no comparte cuántos jugadores hay.</p>
          )
        ) : (
          <div className="srv-state">
            <span className="srv-state-icon" aria-hidden="true">{STATE_ICON[server.state as Exclude<ServerStatus['state'], 'online'>]}</span>
            <p className="srv-state-title">{status.title}</p>
            <p className="srv-note">{status.text}</p>
          </div>
        )}

        {latency && server.latencyMs !== undefined && (
          <p className="srv-latency">
            <span className="srv-bars" data-tone={latency.tone} aria-hidden="true">
              {[1, 2, 3, 4].map((bar) => <span key={bar} className={bar <= latency.bars ? 'srv-bar-on' : undefined} />)}
            </span>
            <span>Conexión {latency.label.toLowerCase()}</span>
            <span className="srv-latency-ms">{server.latencyMs} ms</span>
          </p>
        )}
      </section>

      <section className="srv-section" aria-labelledby="srv-activity">
        <h3 id="srv-activity" className="srv-section-title">Actividad</h3>
        {chart.length >= 2 ? (
          <>
            <div className="srv-chart" role="img" aria-label={`Jugadores en las últimas ${chart.length} comprobaciones, desde las ${timeOfDay(chart[0].at)}. Máximo: ${peak}.`}>
              {chart.map((item) => (
                <span
                  key={item.at}
                  className="srv-chart-bar"
                  data-state={item.state}
                  title={`${timeOfDay(item.at)} · ${item.state === 'online' ? `${item.players ?? 0} jugando` : SERVER_STATE[item.state].label}`}
                  style={{ '--h': item.state === 'online' ? Math.max(0.06, (item.players ?? 0) / scale) : 0.06 } as CSSProperties}
                />
              ))}
            </div>
            <p className="srv-chart-axis" aria-hidden="true">
              <span>{timeOfDay(chart[0].at)}</span>
              <span>Ahora</span>
            </p>
            <dl className="srv-tiles">
              <div><dt>Pico</dt><dd>{peak}</dd></div>
              <div><dt>Ping</dt><dd>{averagePing === null ? '—' : `${averagePing} ms`}</dd></div>
              <div><dt>Despierto</dt><dd>{awake === null ? '—' : `${awake} %`}</dd></div>
            </dl>
            <p className="srv-note">Comprobaciones de las últimas 24 horas: una por minuto mientras el launcher está abierto.</p>
          </>
        ) : (
          <p className="srv-note">La gráfica de jugadores se irá llenando con cada comprobación: una por minuto mientras el launcher está abierto.</p>
        )}
      </section>

      {online && server.motd && (
        <figure className="srv-motd">
          <figcaption>Mensaje del día</figcaption>
          <blockquote className="selectable">{server.motd}</blockquote>
        </figure>
      )}

      <section className="srv-section" aria-labelledby="srv-join">
        <h3 id="srv-join" className="srv-section-title">Cómo entrar</h3>
        <ol className="srv-steps">
          <li>Pulsa <strong>Jugar</strong>: el launcher instala o actualiza lo que falte.</li>
          <li>Minecraft se abre y entra directo en Orvian, sin buscar la IP.</li>
          <li>{server.state === 'sleeping' ? 'Ahora duerme: al entrar se despierta en cerca de un minuto.' : 'Si el servidor duerme, se despierta solo al entrar.'}</li>
        </ol>
      </section>

      {server.checkedAt && <p className="srv-foot">Comprobado {relativeTime(server.checkedAt)}</p>}
    </aside>
  )
}

/** Announces a stage once when it starts, so screen readers follow the install without a flood of updates. */
function useStepAnnouncement(step: keyof typeof STEP_ANNOUNCEMENTS | null): string {
  const [text, setText] = useState('')
  const last = useRef<string | null>(null)
  useEffect(() => {
    if (step === last.current) return
    last.current = step
    setText(step ? STEP_ANNOUNCEMENTS[step] : '')
  }, [step])
  return text
}

function CrashDialog({ state }: { state: LauncherState }) {
  const { phase } = state
  const { performErrorAction } = useLauncherActions()
  const toast = useToast()
  const open = phase.kind === 'crashed'
  const dismiss = (): void => void window.orvian.dismissError()

  return (
    <Dialog
      open={open}
      size="md"
      tone="danger"
      icon={<AlertTriangle size={34} strokeWidth={1.75} />}
      title="Fallo del juego detectado"
      description="El launcher ha guardado el informe del fallo. Repararlo suele resolverlo; si se repite, copia el diagnóstico y envíaselo a quien administra el servidor."
      onClose={dismiss}
      actions={
        <>
          <Button variant="secondary" onClick={() => void performErrorAction({ id: 'view-crash', label: 'Abrir informe del fallo' })}>Abrir informe del fallo</Button>
          <Button
            variant="secondary"
            onClick={() => void window.orvian.copyDiagnostics().then(() => toast({ kind: 'success', message: 'Diagnóstico copiado al portapapeles.' }))}
          >
            Copiar diagnóstico
          </Button>
          <Button variant="primary" data-autofocus="" onClick={() => void window.orvian.dismissError().then(() => window.orvian.repair())}>Reparar e intentar de nuevo</Button>
        </>
      }
    >
      {phase.kind === 'crashed' && (
        <div className="crash-cause">
          <p className="crash-cause-label">Causa probable</p>
          <p className="crash-cause-text selectable">{phase.summary || 'No hay un resumen del fallo; el informe completo tiene los detalles.'}</p>
          {phase.exitCode !== null && <p className="crash-cause-code">Código de salida {phase.exitCode}</p>}
        </div>
      )}
    </Dialog>
  )
}
