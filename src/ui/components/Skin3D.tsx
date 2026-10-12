import { useEffect, useRef, useState } from 'react'
import { Clapperboard, Feather, Layers, Pause, Play, Settings2 } from 'lucide-react'
import type { PlayerAnimation, PlayerObject, SkinViewer as Viewer } from 'skinview3d'
import type { SkinVariant } from '../../shared/ipc-contract'
import { IconButton } from './Button'
import { cx } from './cx'
import { Switch } from './Switch'

/** "auto" chains everyday actions by itself; the rest loop one action, as in Crafty's viewer. */
export type SkinMotion = 'auto' | 'walk' | 'run' | 'crouch' | 'fly' | 'swim'
type Action = 'idle' | 'wave' | 'crouch' | 'hit' | 'walk' | 'run' | 'fly' | 'swim'
type PartName = 'head' | 'body' | 'rightArm' | 'leftArm' | 'rightLeg' | 'leftLeg'

const MOTIONS: Array<{ id: SkinMotion; label: string }> = [
  { id: 'auto', label: 'Automático' },
  { id: 'walk', label: 'Caminar' },
  { id: 'run', label: 'Correr' },
  { id: 'crouch', label: 'Agacharse' },
  { id: 'fly', label: 'Volar' },
  { id: 'swim', label: 'Nadar' }
]

const PARTS: Array<{ id: PartName; label: string }> = [
  { id: 'head', label: 'Cabeza' },
  { id: 'body', label: 'Torso' },
  { id: 'rightArm', label: 'Brazo derecho' },
  { id: 'leftArm', label: 'Brazo izquierdo' },
  { id: 'rightLeg', label: 'Pierna derecha' },
  { id: 'leftLeg', label: 'Pierna izquierda' }
]

/** Three-quarter view, the way skin sites present a character. */
const START_TURN = -0.5

/** In "auto", the gestures played between stretches of idling, and how long each lasts (s). */
const GESTURES: Array<[Action, number]> = [
  ['wave', 2.6],
  ['crouch', 2.2],
  ['hit', 1.5],
  ['walk', 3.6],
  ['wave', 2.6],
  ['crouch', 1.6]
]

const prefersReducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const idleLength = (): number => 4 + Math.random() * 4

type Lib = typeof import('skinview3d')

function makeAction(lib: Lib, action: Action): PlayerAnimation {
  switch (action) {
    case 'wave':
      return new lib.WaveAnimation('right')
    case 'crouch':
      return new lib.CrouchAnimation()
    case 'hit':
      return new lib.HitAnimation()
    case 'walk':
      return new lib.WalkingAnimation()
    case 'run':
      return new lib.RunningAnimation()
    case 'fly':
      return new lib.FlyingAnimation()
    case 'swim':
      return new lib.SwimAnimation()
    default:
      return new lib.IdleAnimation()
  }
}

/** Live settings the render loop reads every frame, without re-creating the viewer. */
interface LiveControls {
  motion: SkinMotion
  paused: boolean
  tracking: boolean
  /** Cursor relative to the character, in window fractions. */
  pointer: { x: number; y: number }
}

interface Skin3DProps {
  src: string
  variant: SkinVariant
  capeSrc?: string | null
  label: string
}

/**
 * The player in 3D, alive like a game's character preview: it idles and acts by itself, follows the
 * mouse with its head, and can walk, run, crouch, fly or swim. Drag orbits the camera, the wheel zooms.
 * skinview3d (three.js) loads only when the Locker opens.
 */
export function Skin3D({ src, variant, capeSrc = null, label }: Skin3DProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewerRef = useRef<Viewer | null>(null)
  const live = useRef<LiveControls>({ motion: 'auto', paused: prefersReducedMotion(), tracking: true, pointer: { x: 0, y: 0 } })
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [motion, setMotion] = useState<SkinMotion>('auto')
  const [paused, setPaused] = useState(prefersReducedMotion)
  const [tracking, setTracking] = useState(true)
  const [spinning, setSpinning] = useState(false)
  const [elytra, setElytra] = useState(false)
  const [showCape, setShowCape] = useState(true)
  const [base, setBase] = useState(true)
  const [outer, setOuter] = useState(true)
  const [hidden, setHidden] = useState<ReadonlySet<PartName>>(new Set())
  const [open, setOpen] = useState<'animations' | 'settings' | null>(null)

  useEffect(() => {
    live.current.motion = motion
    live.current.paused = paused
    live.current.tracking = tracking
  }, [motion, paused, tracking])

  // Create the viewer once, driven by one animation that plays the actions and adds the head tracking
  useEffect(() => {
    let disposed = false
    let observer: ResizeObserver | null = null
    let removePointer: (() => void) | null = null
    void import('skinview3d')
      .then((lib) => {
        const host = hostRef.current
        const canvas = canvasRef.current
        if (disposed || !host || !canvas) return
        const viewer = new lib.SkinViewer({ canvas, width: host.clientWidth, height: host.clientHeight, pixelRatio: 'match-device', zoom: 0.92, fov: 45 })
        viewer.background = null
        // Bright, almost flat light: the skin's own colours read as they do in game
        viewer.globalLight.intensity = 3.4
        viewer.cameraLight.intensity = 0.9
        viewer.controls.enablePan = false
        viewer.controls.minDistance = 20
        viewer.controls.maxDistance = 75
        // Keep the camera between a low and a high shot: never under the floor or straight above the head
        viewer.controls.minPolarAngle = Math.PI * 0.12
        viewer.controls.maxPolarAngle = Math.PI * 0.82
        viewer.autoRotateSpeed = 1.2
        viewer.playerWrapper.rotation.y = START_TURN
        // The GPU driver's shader notes are noise for players; three.js would print them as warnings
        viewer.renderer.debug.checkShaderErrors = false

        let action: Action = 'idle'
        let current = makeAction(lib, 'idle')
        let elapsed = 0
        let length = idleLength()
        let lastMotion: SkinMotion | null = null
        let gesture = Math.floor(Math.random() * GESTURES.length)
        const look = { yaw: 0, pitch: 0 }
        // What the tracking added last frame, taken off again before the action moves the joints
        const applied = { head: { x: 0, y: 0 }, body: 0 }

        const play = (player: PlayerObject, next: Action, seconds: number): void => {
          player.resetJoints()
          player.rotation.set(0, 0, 0)
          player.position.set(0, 0, 0)
          applied.head = { x: 0, y: 0 }
          applied.body = 0
          action = next
          current = makeAction(lib, next)
          elapsed = 0
          length = seconds
        }

        viewer.animation = new lib.FunctionAnimation((player, _progress, delta) => {
          const c = live.current
          const { head, body } = player.skin
          head.rotation.x -= applied.head.x
          head.rotation.y -= applied.head.y
          body.rotation.y -= applied.body

          // A new choice in the menu takes over at once
          if (c.motion !== lastMotion) {
            lastMotion = c.motion
            play(player, c.motion === 'auto' ? 'idle' : c.motion, c.motion === 'auto' ? idleLength() : Infinity)
          }
          if (!c.paused) {
            elapsed += delta
            if (c.motion === 'auto' && elapsed >= length) {
              // Idle between gestures, never the same gesture twice in a row
              if (action === 'idle') {
                gesture = (gesture + 1 + Math.floor(Math.random() * 2)) % GESTURES.length
                play(player, GESTURES[gesture][0], GESTURES[gesture][1])
              } else play(player, 'idle', idleLength())
            }
            current.update(player, delta)
          }

          // Head, and a little of the body, turn towards the cursor, eased so it never snaps
          const lying = action === 'fly' || action === 'swim'
          const yaw = c.tracking && !lying ? Math.max(-1.1, Math.min(1.1, c.pointer.x * 2.6 - START_TURN * 0.7)) : 0
          const pitch = c.tracking && !lying ? Math.max(-0.6, Math.min(0.7, c.pointer.y * 2)) : 0
          const ease = 1 - Math.exp(-delta * 8)
          look.yaw += (yaw - look.yaw) * ease
          look.pitch += (pitch - look.pitch) * ease
          applied.head = { x: look.pitch, y: look.yaw * 0.8 }
          applied.body = look.yaw * 0.2
          head.rotation.x += applied.head.x
          head.rotation.y += applied.head.y
          body.rotation.y += applied.body
        })

        const onPointer = (event: PointerEvent): void => {
          const rect = host.getBoundingClientRect()
          live.current.pointer = {
            x: (event.clientX - (rect.left + rect.width / 2)) / window.innerWidth,
            y: (event.clientY - (rect.top + rect.height * 0.3)) / window.innerHeight
          }
        }
        window.addEventListener('pointermove', onPointer, { passive: true })
        removePointer = () => window.removeEventListener('pointermove', onPointer)

        viewerRef.current = viewer
        observer = new ResizeObserver(() => viewer.setSize(host.clientWidth, host.clientHeight))
        observer.observe(host)
        setReady(true)
      })
      .catch(() => setFailed(true))
    return () => {
      disposed = true
      removePointer?.()
      observer?.disconnect()
      viewerRef.current?.dispose()
      viewerRef.current = null
    }
  }, [])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!ready || !viewer) return
    viewer.loadSkin(src, { model: variant === 'slim' ? 'slim' : 'default' }).catch(() => setFailed(true))
  }, [ready, src, variant])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!ready || !viewer) return
    if (!capeSrc) {
      viewer.loadCape(null)
      return
    }
    const equipment = elytra ? 'elytra' : 'cape'
    viewer
      .loadCape(capeSrc, { backEquipment: equipment })
      .then(() => {
        viewer.playerObject.backEquipment = showCape ? equipment : null
      })
      .catch(() => undefined)
  }, [ready, capeSrc, elytra, showCape])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!ready || !viewer) return
    viewer.autoRotate = spinning
    const skin = viewer.playerObject.skin
    for (const { id } of PARTS) {
      skin[id].visible = !hidden.has(id)
      skin[id].innerLayer.visible = base
      skin[id].outerLayer.visible = outer
    }
  }, [ready, spinning, hidden, base, outer])

  // The panels close on Escape or a click elsewhere
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(null)
    }
    const onDown = (event: PointerEvent): void => {
      if (!(event.target instanceof Element) || !event.target.closest('.skin3d-pop, .skin3d-tools')) setOpen(null)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  const togglePart = (id: PartName): void =>
    setHidden((value) => {
      const next = new Set(value)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggle = (panel: 'animations' | 'settings'): void => setOpen((value) => (value === panel ? null : panel))
  const motionLabel = MOTIONS.find((item) => item.id === motion)?.label ?? ''

  return (
    <div className="skin3d">
      <div ref={hostRef} className={cx('skin3d-stage', ready && 'skin3d-ready')}>
        <canvas ref={canvasRef} role="img" aria-label={label} />
        {failed && <p className="skin3d-error">No se pudo mostrar la vista 3D.</p>}
        <div className="skin3d-tools" role="group" aria-label="Vista 3D">
          <IconButton label="Animaciones" aria-expanded={open === 'animations'} aria-controls="skin3d-animations" disabled={!ready} className={cx(open === 'animations' && 'icon-btn-on')} onClick={() => toggle('animations')}>
            <Clapperboard size={16} strokeWidth={1.75} aria-hidden="true" />
          </IconButton>
          <IconButton label={paused ? 'Reanudar la animación' : 'Pausar la animación'} aria-pressed={paused} disabled={!ready} className={cx(paused && 'icon-btn-on')} onClick={() => setPaused((value) => !value)}>
            {paused ? <Play size={16} strokeWidth={1.75} aria-hidden="true" /> : <Pause size={16} strokeWidth={1.75} aria-hidden="true" />}
          </IconButton>
          <IconButton label={capeSrc ? (elytra ? 'Volver a la capa' : 'Ponerse élitros') : 'Los élitros usan tu capa: ponte una para verlos'} aria-pressed={elytra} disabled={!ready || !capeSrc} className={cx(elytra && 'icon-btn-on')} onClick={() => setElytra((value) => !value)}>
            <Feather size={16} strokeWidth={1.75} aria-hidden="true" />
          </IconButton>
          <IconButton label={outer ? 'Ocultar la capa exterior' : 'Mostrar la capa exterior'} aria-pressed={outer} disabled={!ready} className={cx(outer && 'icon-btn-on')} onClick={() => setOuter((value) => !value)}>
            <Layers size={16} strokeWidth={1.75} aria-hidden="true" />
          </IconButton>
          <IconButton label="Ajustes de la vista" aria-expanded={open === 'settings'} aria-controls="skin3d-settings" disabled={!ready} className={cx(open === 'settings' && 'icon-btn-on')} onClick={() => toggle('settings')}>
            <Settings2 size={16} strokeWidth={1.75} aria-hidden="true" />
          </IconButton>
        </div>

        {open === 'animations' && (
          <div id="skin3d-animations" className="skin3d-pop" role="group" aria-label="Animaciones">
            <p className="skin3d-pop-title">Animaciones</p>
            <p className="skin3d-pop-lead" aria-live="polite">{motion === 'auto' ? 'Va cambiando de acción solo' : `${motionLabel}, en bucle`}</p>
            <div className="skin3d-choices">
              {MOTIONS.map((item) => (
                <button key={item.id} type="button" className="skin3d-choice" aria-pressed={motion === item.id} onClick={() => {
                  setMotion(item.id)
                  setPaused(false)
                }}>
                  {item.label}
                </button>
              ))}
            </div>
            <PopSwitch label="Seguir el ratón con la cabeza" checked={tracking} onChange={setTracking} />
            <PopSwitch label="Girar solo" checked={spinning} onChange={setSpinning} />
          </div>
        )}

        {open === 'settings' && (
          <div id="skin3d-settings" className="skin3d-pop" role="group" aria-label="Ajustes de la vista">
            <p className="skin3d-pop-title">Vista</p>
            <p className="skin3d-pop-lead">Pulsa una parte para ocultarla</p>
            <div className="ed-figure-row">
              <div className="ed-figure" role="group" aria-label="Partes visibles">
                {PARTS.map((part) => (
                  <button key={part.id} type="button" className={cx('ed-figure-part', `ed-figure-${part.id}`, variant === 'slim' && 'ed-figure-slim')} aria-pressed={!hidden.has(part.id)} aria-label={part.label} title={part.label} onClick={() => togglePart(part.id)} />
                ))}
              </div>
              <div className="skin3d-figure-options">
                <div className="skin3d-choices">
                  <button type="button" className="skin3d-choice" aria-pressed={base} onClick={() => setBase((value) => !value)}>Base</button>
                  <button type="button" className="skin3d-choice" aria-pressed={outer} onClick={() => setOuter((value) => !value)}>Exterior</button>
                </div>
                <div className="skin3d-choices">
                  <button type="button" className="skin3d-choice" disabled={hidden.size === 0} onClick={() => setHidden(new Set())}>Todas</button>
                  <button type="button" className="skin3d-choice" disabled={hidden.size === PARTS.length} onClick={() => setHidden(new Set(PARTS.map((part) => part.id)))}>Ninguna</button>
                </div>
                <p className="skin3d-pop-lead">{hidden.size === 0 ? 'Se ven todas las partes' : `Se ven ${PARTS.length - hidden.size} de ${PARTS.length} partes`}</p>
              </div>
            </div>
            <PopSwitch label="Capa" checked={showCape} disabled={!capeSrc} onChange={setShowCape} />
            <PopSwitch label="Élitros en vez de capa" checked={elytra} disabled={!capeSrc} onChange={setElytra} />
            {!capeSrc && <p className="skin3d-pop-lead">No llevas capa: elige una en la lista para verla aquí.</p>}
          </div>
        )}
      </div>
      <p className="skin3d-hint">Arrastra para girar la cámara · rueda para acercar · mueve el ratón y te mirará</p>
    </div>
  )
}

function PopSwitch({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className={cx('skin3d-switch', disabled && 'skin3d-switch-off')}>
      <span aria-hidden="true">{label}</span>
      <Switch label={label} checked={checked} disabled={disabled} onChange={onChange} />
    </div>
  )
}
