import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import {
  ArrowDown, ArrowUp, Box, Brush, ChevronLeft, ChevronRight, Copy, Download, Droplet, Eraser, Eye, EyeOff, FileImage, FlipHorizontal2,
  Grid3x3, HelpCircle, Image as ImageIcon, Layers as LayersIcon, Merge, Navigation, PaintBucket, Palette, Pipette, Plus, Redo2, RotateCcw,
  Save, Search, Shirt, SlidersHorizontal, SquareDashed, Sun, Trash2, Undo2, Upload, User, Wrench, X
} from 'lucide-react'
import type { SkinVariant } from '../../shared/ipc-contract'
import { Button, IconButton } from '../components/Button'
import { cx } from '../components/cx'
import { Switch } from '../components/Switch'
import { useToast } from '../components/Toast'
import { Canvas2D } from '../editor/Canvas2D'
import { ColorWheel } from '../editor/ColorWheel'
import { fromHex, fromHsv, PALETTES, shades, toHex, toHsv, type RGBA } from '../editor/color'
import { NO_FILTERS, SkinDocument, type Filters, type Tool } from '../editor/doc'
import { PART_LABEL, PARTS, type LayerKind, type PartId } from '../editor/layout'
import { DEFAULT_SKINS, loadSkinPixels, referenceTexture, toPngDataUrl } from '../editor/templates'
import { NEUTRAL_POSE, Viewport3D, type Pose } from '../editor/Viewport3D'
import { ipcErrorMessage } from '../ipcError'

type View = '3d' | 'flat' | '2d'

const TOOLS: Array<{ id: Tool; label: string; key: string; icon: ReactNode; hint: string }> = [
  { id: 'brush', label: 'Pincel', key: 'B', icon: <Brush size={16} strokeWidth={1.75} aria-hidden="true" />, hint: 'Pinta. Con el botón derecho borra.' },
  { id: 'eraser', label: 'Goma', key: 'E', icon: <Eraser size={16} strokeWidth={1.75} aria-hidden="true" />, hint: 'Borra píxeles de la capa activa.' },
  { id: 'fill', label: 'Relleno', key: 'G', icon: <PaintBucket size={16} strokeWidth={1.75} aria-hidden="true" />, hint: 'Rellena el área del mismo color dentro de esa cara. Con el botón derecho la vacía.' },
  { id: 'shade', label: 'Sombra', key: 'S', icon: <Sun size={16} strokeWidth={1.75} aria-hidden="true" />, hint: 'Aclara al pintar; con el botón derecho oscurece.' },
  { id: 'pick', label: 'Tomar', key: 'I', icon: <Pipette size={16} strokeWidth={1.75} aria-hidden="true" />, hint: 'Toma el color de un píxel. Mantén Alt para usarlo desde cualquier herramienta.' }
]

const DRAFT_KEY = 'orvian.editor.draft'
const TOUR_KEY = 'orvian.editor.tour'
const PALETTE_KEY = 'orvian.editor.palettes'

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage can be full or unavailable: the draft is a convenience, not a promise
  }
}

/** Points between two pixels, so a quick drag leaves a continuous line. */
function line(x0: number, y0: number, x1: number, y1: number): Array<[number, number]> {
  const points: Array<[number, number]> = []
  const dx = Math.abs(x1 - x0)
  const dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx + dy
  for (;;) {
    points.push([x0, y0])
    if (x0 === x1 && y0 === y1) break
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      x0 += sx
    }
    if (e2 <= dx) {
      err += dx
      y0 += sy
    }
  }
  return points
}

function Card({ id, icon, title, lead, actions, children, className }: { id: string; icon: ReactNode; title: string; lead: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('ed-card', className)} data-tour={id} aria-labelledby={`ed-${id}`}>
      <header className="ed-card-head">
        <span className="ed-card-icon" aria-hidden="true">{icon}</span>
        <div className="ed-card-titles">
          <h2 id={`ed-${id}`} className="ed-card-title">{title}</h2>
          <p className="ed-card-lead">{lead}</p>
        </div>
        {actions && <div className="ed-card-actions">{actions}</div>}
      </header>
      <div className="ed-card-body">{children}</div>
    </section>
  )
}

function Group({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="ed-group">
      <h3 className="ed-group-label">
        <span aria-hidden="true">{icon}</span>
        {label}
      </h3>
      {children}
    </div>
  )
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ id: T; label: ReactNode; title?: string }>; onChange: (value: T) => void }) {
  return (
    <div className="segmented ed-segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option.id} type="button" className="segment" aria-pressed={value === option.id} title={option.title} onClick={() => onChange(option.id)}>
          {option.label}
        </button>
      ))}
    </div>
  )
}

export default function SkinEditor() {
  const toast = useToast()
  const draft = useMemo(() => readStorage<{ pixels?: number[]; name?: string; slim?: boolean } | null>(DRAFT_KEY, null), [])
  const docRef = useRef<SkinDocument | null>(null)
  if (!docRef.current) docRef.current = new SkinDocument(draft?.pixels ? new Uint8ClampedArray(draft.pixels) : undefined, draft?.name ?? 'Skin en blanco')
  const doc = docRef.current
  const version = useSyncExternalStore((listener) => doc.subscribe(listener), () => doc.version)
  // `version` re-renders this view after every change; the document caches its flattened pixels
  const pixels = doc.composite()

  const [name, setName] = useState(draft?.name ?? 'Skin en blanco')
  const [slim, setSlim] = useState(draft?.slim ?? false)
  const [view, setView] = useState<View>('3d')
  const [target, setTarget] = useState<LayerKind>('base')
  const [hidden, setHidden] = useState<Set<PartId>>(new Set())
  const [grid, setGrid] = useState(true)
  const [arrow, setArrow] = useState(true)
  const [zoom, setZoom] = useState(0.9)
  const [tool, setTool] = useState<Tool>('brush')
  const [size, setSize] = useState(1)
  const [round, setRound] = useState(false)
  const [mirrorOn, setMirrorOn] = useState(false)
  const [color, setColor] = useState<RGBA>({ r: 232, g: 69, b: 60, a: 255 })
  const [hexInput, setHexInput] = useState(toHex({ r: 232, g: 69, b: 60, a: 255 }))
  const [recent, setRecent] = useState<string[]>([])
  const [paletteId, setPaletteId] = useState(PALETTES[0].id)
  const [saved, setSaved] = useState<string[][]>(() => readStorage<string[][]>(PALETTE_KEY, []))
  const [pose, setPose] = useState<Pose>(NEUTRAL_POSE)
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [tour, setTour] = useState<number | null>(() => (readStorage<boolean>(TOUR_KEY, false) ? null : 0))
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const lastPoint = useRef<[number, number] | null>(null)
  const altHeld = useRef(false)

  const hsv = toHsv(color)
  const active = doc.activeLayer

  // Keep the drawing across restarts of the launcher
  useEffect(() => {
    const timer = window.setTimeout(() => writeStorage(DRAFT_KEY, { pixels: Array.from(pixels), name, slim }), 400)
    return () => window.clearTimeout(timer)
  }, [pixels, name, slim])

  const chooseColor = useCallback((next: RGBA) => {
    setColor(next)
    setHexInput(toHex(next))
  }, [])

  const remember = (hex: string): void => setRecent((list) => [hex, ...list.filter((item) => item !== hex)].slice(0, 16))

  const onStroke = useCallback(
    ({ x, y, inverse, phase }: { x: number; y: number; inverse: boolean; phase: 'start' | 'move' }) => {
      const effective: Tool = altHeld.current ? 'pick' : tool
      const opts = { tool: effective, color, size, round, mirror: mirrorOn, target, slim, inverse }
      if (effective === 'pick') {
        const picked = doc.paint(x, y, opts)
        if (picked) chooseColor(picked)
        return
      }
      if (phase === 'start') {
        doc.checkpoint()
        lastPoint.current = null
        if (effective === 'brush' || effective === 'fill') remember(toHex(color))
      }
      if (effective === 'fill') {
        if (phase === 'start') doc.paint(x, y, opts)
        return
      }
      const from = lastPoint.current
      const points = from && Math.abs(from[0] - x) <= 6 && Math.abs(from[1] - y) <= 6 ? line(from[0], from[1], x, y) : [[x, y] as [number, number]]
      for (const [px, py] of points) doc.paint(px, py, opts)
      lastPoint.current = [x, y]
    },
    [doc, tool, color, size, round, mirrorOn, target, slim, chooseColor]
  )
  const onStrokeEnd = useCallback(() => {
    lastPoint.current = null
  }, [])

  // Keyboard shortcuts, as in the reference editor
  useEffect(() => {
    const down = (event: KeyboardEvent): void => {
      if (event.key === 'Alt') altHeld.current = true
      const typing = event.target instanceof HTMLElement && (event.target.closest('input, textarea, select, [contenteditable]') !== null)
      if (typing || tour !== null) return
      const key = event.key.toLowerCase()
      if ((event.ctrlKey || event.metaKey) && key === 'z') {
        event.preventDefault()
        if (event.shiftKey) doc.redo()
        else doc.undo()
        return
      }
      if ((event.ctrlKey || event.metaKey) && key === 'y') {
        event.preventDefault()
        doc.redo()
        return
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const found = TOOLS.find((item) => item.key.toLowerCase() === key)
      if (found) setTool(found.id)
      else if (key === 'm') setMirrorOn((value) => !value)
      else if (key === 'l') setTarget((value) => (value === 'base' ? 'overlay' : 'base'))
      else if (key === '[') setSize((value) => Math.max(1, value - 1))
      else if (key === ']') setSize((value) => Math.min(3, value + 1))
    }
    const up = (event: KeyboardEvent): void => {
      if (event.key === 'Alt') altHeld.current = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [doc, tour])

  // ─── Loading ────────────────────────────────────────────────────────────

  const load = async (key: string, task: () => Promise<{ pixels: Uint8ClampedArray | null; name: string; slim?: boolean }>): Promise<void> => {
    setBusy(key)
    try {
      const result = await task()
      doc.reset(result.pixels, result.name)
      setName(result.name)
      if (result.slim !== undefined) setSlim(result.slim)
    } catch (err) {
      toast({ kind: 'error', message: ipcErrorMessage(err) })
    } finally {
      setBusy(null)
    }
  }

  const loadFile = (file: File): void => {
    if (!/\.png$/i.test(file.name) && file.type !== 'image/png') {
      toast({ kind: 'error', message: 'Elige una imagen PNG.' })
      return
    }
    void load('file', async () => {
      const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('No se pudo leer el archivo.'))
        reader.readAsDataURL(file)
      })
      return { pixels: await loadSkinPixels(url), name: file.name.replace(/\.png$/i, '') }
    })
  }

  const loadUser = (): void => {
    const clean = username.trim()
    if (!/^\w{3,16}$/.test(clean)) {
      toast({ kind: 'error', message: 'Escribe un nombre de Minecraft válido (3 a 16 letras, números o _).' })
      return
    }
    void load('user', async () => {
      const found = await window.orvian.lookupSkin(clean)
      return { pixels: await loadSkinPixels(found.url), name: found.name, slim: found.variant === 'slim' }
    })
  }

  // ─── Output ─────────────────────────────────────────────────────────────

  const download = (): void => {
    const link = document.createElement('a')
    link.href = toPngDataUrl(pixels)
    link.download = `${name.replace(/[^\w.-]+/g, '_') || 'skin'}.png`
    link.click()
  }

  const variant: SkinVariant = slim ? 'slim' : 'classic'
  const saveToLocker = async (andApply: boolean): Promise<void> => {
    setBusy(andApply ? 'apply' : 'save')
    try {
      const item = await window.orvian.saveSkinPng(name.slice(0, 40) || 'Skin', variant, toPngDataUrl(pixels))
      if (andApply) {
        await window.orvian.applySkin(item.id)
        toast({ kind: 'success', message: 'Skin puesta en tu cuenta. Los demás la verán al volver a entrar al servidor.' })
      } else toast({ kind: 'success', message: `Guardada en tu armario como «${item.name}».` })
    } catch (err) {
      toast({ kind: 'error', message: ipcErrorMessage(err) })
    } finally {
      setBusy(null)
    }
  }

  const setFilter = (patch: Partial<Filters>, record = false): void => doc.updateLayer(active.id, { filters: patch }, record)
  const filters = active.filters

  const turn = (part: keyof Omit<Pose, 'backwards'>, delta: number): void =>
    setPose((value) => ({ ...value, [part]: Math.abs(value[part] + delta) > 1.6 ? 0 : value[part] + delta }))

  const closeTour = (): void => {
    setTour(null)
    writeStorage(TOUR_KEY, true)
  }

  return (
    <div className="view view-enter skin-editor-view">
      <div className="ed-inner">
        <header className="view-header">
          <div>
            <h1 className="view-title">Editor</h1>
            <p className="view-lead">Pinta directamente sobre el modelo o sobre la textura plana, con capas, simetría, relleno y sombreado. Carga la skin de cualquier jugador o empieza de cero.</p>
          </div>
          <Button variant="ghost" icon={<HelpCircle size={16} strokeWidth={1.75} aria-hidden="true" />} onClick={() => setTour(0)}>Ver el tutorial</Button>
        </header>

        <div className="ed-grid">
          {/* ─── Left: source and colour ─── */}
          <div className="ed-col">
            <Card id="source" icon={<FileImage size={18} strokeWidth={1.75} />} title="Origen" lead="Carga una skin, elige la capa y las guías">
              <Group icon={<Shirt size={13} strokeWidth={2} />} label="Skin">
                <label className="ed-name">
                  <span className="visually-hidden">Nombre de la skin</span>
                  <input className="input" value={name} maxLength={40} onChange={(event) => setName(event.target.value)} spellCheck={false} />
                </label>
                <button
                  type="button"
                  className={cx('ed-drop', dragging && 'ed-drop-over')}
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(event) => {
                    event.preventDefault()
                    setDragging(true)
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault()
                    setDragging(false)
                    const file = event.dataTransfer.files[0]
                    if (file) loadFile(file)
                  }}
                >
                  <Upload size={15} strokeWidth={1.75} aria-hidden="true" />
                  Subir o soltar una skin (.png)
                </button>
                <input ref={fileRef} type="file" accept="image/png" hidden onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) loadFile(file)
                  event.target.value = ''
                }} />
                <form className="ed-user" onSubmit={(event) => {
                  event.preventDefault()
                  loadUser()
                }}>
                  <Search size={15} strokeWidth={1.75} aria-hidden="true" className="ed-user-icon" />
                  <input className="input" placeholder="Cargar de un jugador…" aria-label="Nombre de un jugador de Minecraft" value={username} maxLength={16} spellCheck={false} autoComplete="off" onChange={(event) => setUsername(event.target.value)} />
                  <Button type="submit" size="sm" variant="ghost" loading={busy === 'user'}>Cargar</Button>
                </form>
                <div className="ed-row">
                  <Button size="sm" icon={<SquareDashed size={14} strokeWidth={1.75} aria-hidden="true" />} onClick={() => void load('blank', async () => ({ pixels: null, name: 'Skin en blanco' }))}>Lienzo en blanco</Button>
                  <Button size="sm" icon={<Download size={14} strokeWidth={1.75} aria-hidden="true" />} onClick={download}>Descargar PNG</Button>
                </div>
                <ul className="ed-templates" aria-label="Plantillas">
                  {([
                    ['steve', 'Steve', DEFAULT_SKINS.steve.url],
                    ['alex', 'Alex', DEFAULT_SKINS.alex.url],
                    ['uv', 'Mapa UV', null],
                    ['guide', 'Guía', null]
                  ] as const).map(([id, label, url]) => (
                    <li key={id}>
                      <button type="button" className="ed-template" disabled={busy !== null} onClick={() => void load(id, async () => {
                        if (id === 'steve' || id === 'alex') return { pixels: await loadSkinPixels(url as string), name: label, slim: DEFAULT_SKINS[id].slim }
                        return { pixels: referenceTexture(id, slim), name: label }
                      })}>
                        <TemplateFace id={id} />
                        <span>{label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Group>

              <Group icon={<User size={13} strokeWidth={2} />} label="Modelo">
                <Segmented label="Modelo de brazos" value={slim ? 'slim' : 'classic'} onChange={(value) => setSlim(value === 'slim')} options={[{ id: 'classic', label: 'Ancho' }, { id: 'slim', label: 'Delgado' }]} />
              </Group>

              <Group icon={<LayersIcon size={13} strokeWidth={2} />} label="Capas de la skin">
                <div className="ed-figure-row">
                  <div className="ed-figure" role="group" aria-label="Partes visibles">
                    {PARTS.map((part) => (
                      <button key={part} type="button" className={cx('ed-figure-part', `ed-figure-${part}`, slim && 'ed-figure-slim')} aria-pressed={!hidden.has(part)} title={`${hidden.has(part) ? 'Mostrar' : 'Ocultar'}: ${PART_LABEL[part]}`} aria-label={PART_LABEL[part]} onClick={() => setHidden((value) => {
                        const next = new Set(value)
                        if (next.has(part)) next.delete(part)
                        else next.add(part)
                        return next
                      })} />
                    ))}
                  </div>
                  <div className="ed-figure-options">
                    <Segmented label="Capa que pintas" value={target} onChange={setTarget} options={[{ id: 'base', label: 'Base' }, { id: 'overlay', label: 'Exterior' }]} />
                    <div className="ed-row">
                      <Button size="sm" variant="ghost" onClick={() => setHidden(new Set())}>Todas</Button>
                      <Button size="sm" variant="ghost" onClick={() => setHidden(new Set(PARTS))}>Ninguna</Button>
                    </div>
                  </div>
                </div>
                <p className="side-note">Pintando la capa {target === 'base' ? 'base' : 'exterior'}. Pulsa una parte de la figura para ocultarla.</p>
              </Group>

              <Group icon={<Grid3x3 size={13} strokeWidth={2} />} label="Ayudas de dibujo">
                <div className="ed-toggles">
                  <div className="ed-toggle"><Grid3x3 size={14} strokeWidth={1.75} aria-hidden="true" /><span>Cuadrícula</span><Switch checked={grid} label="Cuadrícula de píxeles" onChange={setGrid} /></div>
                  <div className="ed-toggle"><Navigation size={14} strokeWidth={1.75} aria-hidden="true" /><span>Flecha frontal</span><Switch checked={arrow} label="Flecha que marca el frente" onChange={setArrow} /></div>
                </div>
              </Group>
            </Card>

            <Card id="colour" icon={<Palette size={18} strokeWidth={1.75} />} title="Color" lead="El color con el que pinta el pincel">
              <Group icon={<Droplet size={13} strokeWidth={2} />} label="Selector">
                <ColorWheel hue={hsv.h} saturation={hsv.s} onChange={(h, s) => chooseColor(fromHsv(h, s, hsv.v || 1))} />
                <label className="ed-slider">
                  <span>Brillo</span>
                  <input type="range" min={0} max={100} value={Math.round(hsv.v * 100)} onChange={(event) => chooseColor(fromHsv(hsv.h, hsv.s, Number(event.target.value) / 100))} />
                  <output>{Math.round(hsv.v * 100)} %</output>
                </label>
                <div className="ed-rgb">
                  {(['r', 'g', 'b'] as const).map((channel) => (
                    <label key={channel}>
                      <span>{channel.toUpperCase()}</span>
                      <input className="input" inputMode="numeric" value={color[channel]} onChange={(event) => {
                        const n = Math.max(0, Math.min(255, Number(event.target.value.replace(/\D/g, '')) || 0))
                        chooseColor({ ...color, [channel]: n })
                      }} />
                    </label>
                  ))}
                </div>
                <div className="ed-hex">
                  <span className="ed-swatch-big" style={{ background: toHex(color) }} aria-hidden="true" />
                  <input className="input mono" aria-label="Color en hexadecimal" value={hexInput} maxLength={7} spellCheck={false} onChange={(event) => {
                    setHexInput(event.target.value)
                    const parsed = fromHex(event.target.value)
                    if (parsed) setColor(parsed)
                  }} />
                  <IconButton label="Volver al color anterior" disabled={recent.length === 0} onClick={() => {
                    const previous = recent.find((hex) => hex !== toHex(color))
                    const parsed = previous ? fromHex(previous) : null
                    if (parsed) chooseColor(parsed)
                  }}>
                    <RotateCcw size={15} strokeWidth={1.75} aria-hidden="true" />
                  </IconButton>
                </div>
              </Group>

              <Group icon={<Sun size={13} strokeWidth={2} />} label="Matices">
                <Swatches colors={shades(color).map(toHex)} onPick={(hex) => chooseColor(fromHex(hex) as RGBA)} />
              </Group>

              <Group icon={<Palette size={13} strokeWidth={2} />} label="Paletas">
                <select className="input ed-select" aria-label="Paleta" value={paletteId} onChange={(event) => setPaletteId(event.target.value)}>
                  {PALETTES.map((palette) => <option key={palette.id} value={palette.id}>{palette.label}</option>)}
                </select>
                <Swatches colors={PALETTES.find((palette) => palette.id === paletteId)?.colors ?? []} onPick={(hex) => chooseColor(fromHex(hex) as RGBA)} />
              </Group>

              <Group icon={<RotateCcw size={13} strokeWidth={2} />} label="Recientes">
                {recent.length === 0 ? <p className="side-note">Todavía nada. Pinta algo.</p> : <Swatches colors={recent} onPick={(hex) => chooseColor(fromHex(hex) as RGBA)} />}
              </Group>

              <Group icon={<Save size={13} strokeWidth={2} />} label="Guardadas">
                {saved.length === 0 ? <p className="side-note">Aún no has guardado paletas. Pinta con unos colores y guárdalos aquí.</p> : saved.map((palette, index) => (
                  <div key={index} className="ed-saved">
                    <Swatches colors={palette} onPick={(hex) => chooseColor(fromHex(hex) as RGBA)} />
                    <IconButton label="Borrar esta paleta" onClick={() => {
                      const next = saved.filter((_, i) => i !== index)
                      setSaved(next)
                      writeStorage(PALETTE_KEY, next)
                    }}>
                      <Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />
                    </IconButton>
                  </div>
                ))}
                <Button size="sm" variant="ghost" disabled={recent.length === 0} icon={<Plus size={14} strokeWidth={2} aria-hidden="true" />} onClick={() => {
                  const next = [recent.slice(0, 10), ...saved].slice(0, 12)
                  setSaved(next)
                  writeStorage(PALETTE_KEY, next)
                }}>
                  Guardar los recientes como paleta
                </Button>
              </Group>

              <Group icon={<Shirt size={13} strokeWidth={2} />} label="En esta skin">
                <InSkin doc={doc} onPick={(hex) => chooseColor(fromHex(hex) as RGBA)} />
              </Group>
            </Card>
          </div>

          {/* ─── Centre: the skin ─── */}
          <div className="ed-col ed-col-center">
            <Card
              id="skin"
              className="ed-stage-card"
              icon={<Box size={18} strokeWidth={1.75} />}
              title="Skin"
              lead={`64×64, brazos ${slim ? 'delgados' : 'anchos'}, ${name || 'sin nombre'}`}
              actions={<Segmented label="Vista" value={view} onChange={setView} options={[{ id: '3d', label: '3D' }, { id: 'flat', label: 'Plano', title: 'Pinta sobre la figura vista de frente' }, { id: '2d', label: '2D', title: 'Pinta sobre la textura completa' }]} />}
            >
              <div className="ed-stage">
                {view === '3d' ? (
                  <Viewport3D pixels={pixels} version={version} slim={slim} target={target} hidden={hidden} grid={grid} arrow={arrow} zoom={zoom} pose={pose} onStroke={onStroke} onStrokeEnd={onStrokeEnd} />
                ) : (
                  <Canvas2D mode={view === '2d' ? 'texture' : 'flat'} pixels={pixels} version={version} slim={slim} target={target} hidden={hidden} grid={grid} zoom={zoom} onStroke={onStroke} onStrokeEnd={onStrokeEnd} />
                )}
              </div>
              <label className="ed-slider ed-zoom">
                <span>Zoom</span>
                <input type="range" min={0.5} max={2} step={0.05} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
                <output>{zoom.toFixed(2)}</output>
              </label>
              <div className="ed-output">
                <Button variant="primary" icon={<Download size={16} strokeWidth={1.75} aria-hidden="true" />} onClick={download}>Descargar skin</Button>
                <Button icon={<Save size={16} strokeWidth={1.75} aria-hidden="true" />} loading={busy === 'save'} disabled={busy !== null} onClick={() => void saveToLocker(false)}>Guardar en el armario</Button>
                <Button icon={<Shirt size={16} strokeWidth={1.75} aria-hidden="true" />} loading={busy === 'apply'} disabled={busy !== null} onClick={() => void saveToLocker(true)}>Usar en mi cuenta</Button>
              </div>
            </Card>
          </div>

          {/* ─── Right: tools and layers ─── */}
          <div className="ed-col">
            <Card
              id="tools"
              icon={<Wrench size={18} strokeWidth={1.75} />}
              title="Herramientas"
              lead="Elige una herramienta o edita la capa entera"
              actions={
                <>
                  <IconButton label="Deshacer (Ctrl+Z)" disabled={!doc.canUndo} onClick={() => doc.undo()}><Undo2 size={15} strokeWidth={1.75} aria-hidden="true" /></IconButton>
                  <IconButton label="Rehacer (Ctrl+Mayús+Z)" disabled={!doc.canRedo} onClick={() => doc.redo()}><Redo2 size={15} strokeWidth={1.75} aria-hidden="true" /></IconButton>
                </>
              }
            >
              <Group icon={<Brush size={13} strokeWidth={2} />} label="Herramientas">
                <div className="ed-tools" role="group" aria-label="Herramienta">
                  {TOOLS.map((item) => (
                    <button key={item.id} type="button" className="ed-tool" aria-pressed={tool === item.id} title={`${item.id === 'pick' ? 'Cuentagotas' : item.label} (${item.key})`} onClick={() => setTool(item.id)}>
                      {item.icon}
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
                <p className="side-note">{TOOLS.find((item) => item.id === tool)?.hint}</p>
              </Group>

              <Group icon={<SquareDashed size={13} strokeWidth={2} />} label="Pincel">
                <div className="ed-row">
                  <Segmented label="Tamaño" value={String(size)} onChange={(value) => setSize(Number(value))} options={[{ id: '1', label: '1 px' }, { id: '2', label: '2 px' }, { id: '3', label: '3 px' }]} />
                  <Segmented label="Forma" value={round ? 'round' : 'square'} onChange={(value) => setRound(value === 'round')} options={[{ id: 'square', label: 'Cuadrado' }, { id: 'round', label: 'Redondo' }]} />
                </div>
              </Group>

              <Group icon={<FlipHorizontal2 size={13} strokeWidth={2} />} label="Simetría">
                <div className="ed-toggle"><FlipHorizontal2 size={14} strokeWidth={1.75} aria-hidden="true" /><span>Espejo (M)</span><Switch checked={mirrorOn} label="Pintar en espejo" onChange={setMirrorOn} /></div>
              </Group>

              <Group icon={<SlidersHorizontal size={13} strokeWidth={2} />} label={`Filtros · ${active.name}`}>
                <div className="ed-filter">
                  <span>Tinte</span>
                  <input type="range" min={0} max={100} value={filters.tintAmount} aria-label="Cantidad de tinte" onPointerDown={() => doc.checkpoint()} onChange={(event) => setFilter({ tintAmount: Number(event.target.value), tint: filters.tint ?? toHex(color) })} />
                  <output>{filters.tintAmount}</output>
                  <button type="button" className="ed-tint" aria-label="Usar el color actual como tinte" style={{ background: filters.tint ?? toHex(color) }} onClick={() => setFilter({ tint: toHex(color) }, true)} />
                </div>
                {([
                  ['brightness', 'Brillo', 0, 200],
                  ['contrast', 'Contraste', 0, 200],
                  ['saturation', 'Saturación', 0, 200],
                  ['hue', 'Tono', -180, 180]
                ] as const).map(([key, label, min, max]) => (
                  <label key={key} className="ed-filter">
                    <span>{label}</span>
                    <input type="range" min={min} max={max} value={filters[key]} onPointerDown={() => doc.checkpoint()} onChange={(event) => setFilter({ [key]: Number(event.target.value) })} />
                    <output>{filters[key]}</output>
                  </label>
                ))}
                <div className="ed-row">
                  <Button size="sm" variant={filters.greyscale ? 'primary' : 'secondary'} aria-pressed={filters.greyscale} onClick={() => setFilter({ greyscale: !filters.greyscale }, true)}>Escala de grises</Button>
                  <Button size="sm" variant={filters.invert ? 'primary' : 'secondary'} aria-pressed={filters.invert} onClick={() => setFilter({ invert: !filters.invert }, true)}>Invertir</Button>
                  <Button size="sm" variant="ghost" onClick={() => setFilter({ ...NO_FILTERS }, true)}>Restablecer</Button>
                </div>
              </Group>

              <Group icon={<RotateCcw size={13} strokeWidth={2} />} label="Pose">
                <div className="ed-pose">
                  <Button size="sm" icon={<ChevronLeft size={14} strokeWidth={2} aria-hidden="true" />} onClick={() => turn('head', 0.4)}>Girar cabeza</Button>
                  <Button size="sm" icon={<ChevronRight size={14} strokeWidth={2} aria-hidden="true" />} onClick={() => turn('head', -0.4)}>Girar cabeza</Button>
                  <Button size="sm" onClick={() => turn('body', 0.3)}>Torso</Button>
                  <Button size="sm" onClick={() => turn('rightArm', -0.5)}>Brazo derecho</Button>
                  <Button size="sm" onClick={() => turn('leftArm', -0.5)}>Brazo izquierdo</Button>
                  <Button size="sm" onClick={() => turn('rightLeg', 0.4)}>Pierna derecha</Button>
                  <Button size="sm" onClick={() => turn('leftLeg', 0.4)}>Pierna izquierda</Button>
                  <Button size="sm" aria-pressed={pose.backwards} onClick={() => setPose((value) => ({ ...value, backwards: !value.backwards }))}>Mirar atrás</Button>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setPose(NEUTRAL_POSE)}>Pose neutra</Button>
              </Group>
            </Card>

            <Card
              id="layers"
              icon={<LayersIcon size={18} strokeWidth={1.75} />}
              title="Capas"
              lead="Apila, combina y reordena"
              actions={<Button size="sm" variant="ghost" icon={<Plus size={14} strokeWidth={2} aria-hidden="true" />} onClick={() => doc.addLayer()}>Añadir</Button>}
            >
              <ol className="ed-layers" aria-label="Pila de capas">
                {[...doc.layers].reverse().map((layer, reversedIndex) => {
                  const index = doc.layers.length - 1 - reversedIndex
                  const selected = layer.id === doc.active
                  return (
                    <li key={layer.id} className={cx('ed-layer', selected && 'ed-layer-active')}>
                      <button type="button" className="ed-layer-main" aria-pressed={selected} onClick={() => doc.select(layer.id)}>
                        <LayerThumb pixels={layer.pixels} version={version} />
                        <input
                          className="ed-layer-name"
                          aria-label="Nombre de la capa"
                          value={layer.name}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => doc.updateLayer(layer.id, { name: event.target.value }, false)}
                        />
                      </button>
                      <IconButton label={layer.visible ? 'Ocultar la capa' : 'Mostrar la capa'} onClick={() => doc.updateLayer(layer.id, { visible: !layer.visible })}>
                        {layer.visible ? <Eye size={14} strokeWidth={1.75} aria-hidden="true" /> : <EyeOff size={14} strokeWidth={1.75} aria-hidden="true" />}
                      </IconButton>
                      {selected && (
                        <div className="ed-layer-tools">
                          <label className="ed-slider">
                            <span>Opacidad</span>
                            <input type="range" min={0} max={100} value={layer.opacity} onPointerDown={() => doc.checkpoint()} onChange={(event) => doc.updateLayer(layer.id, { opacity: Number(event.target.value) }, false)} />
                            <output>{layer.opacity}</output>
                          </label>
                          <div className="ed-row">
                            <IconButton label="Subir la capa" disabled={index === doc.layers.length - 1} onClick={() => doc.move(layer.id, 1)}><ArrowUp size={14} strokeWidth={1.75} aria-hidden="true" /></IconButton>
                            <IconButton label="Bajar la capa" disabled={index === 0} onClick={() => doc.move(layer.id, -1)}><ArrowDown size={14} strokeWidth={1.75} aria-hidden="true" /></IconButton>
                            <IconButton label="Duplicar la capa" onClick={() => doc.duplicate(layer.id)}><Copy size={14} strokeWidth={1.75} aria-hidden="true" /></IconButton>
                            <IconButton label="Combinar con la capa de abajo" disabled={index === 0} onClick={() => doc.mergeDown(layer.id)}><Merge size={14} strokeWidth={1.75} aria-hidden="true" /></IconButton>
                            <IconButton label="Borrar la capa" disabled={doc.layers.length <= 1} onClick={() => doc.remove(layer.id)}><Trash2 size={14} strokeWidth={1.75} aria-hidden="true" /></IconButton>
                          </div>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ol>
            </Card>
          </div>
        </div>

        <Controls />
      </div>

      {tour !== null && <Tour step={tour} onStep={setTour} onClose={closeTour} />}
    </div>
  )
}

function Swatches({ colors, onPick }: { colors: string[]; onPick: (hex: string) => void }) {
  return (
    <ul className="ed-swatches">
      {colors.map((hex, index) => (
        <li key={`${hex}-${index}`}>
          <button type="button" className="ed-swatch" style={{ background: hex }} aria-label={`Usar ${hex}`} title={hex} onClick={() => onPick(hex)} />
        </li>
      ))}
    </ul>
  )
}

function InSkin({ doc, onPick }: { doc: SkinDocument; onPick: (hex: string) => void }) {
  const colors = doc.colorsInSkin()
  return colors.length === 0 ? <p className="side-note">Esta textura está vacía.</p> : <Swatches colors={colors} onPick={onPick} />
}

function LayerThumb({ pixels, version }: { pixels: Uint8ClampedArray; version: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    ref.current?.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(pixels), 64, 64), 0, 0)
  }, [pixels, version])
  return <canvas ref={ref} width={64} height={64} className="ed-layer-thumb" aria-hidden="true" />
}

/** Thumbnail of a template: the face of Steve or Alex, or a sample of the reference textures. */
function TemplateFace({ id }: { id: 'steve' | 'alex' | 'uv' | 'guide' }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    if (id === 'uv' || id === 'guide') {
      const pixels = referenceTexture(id, false)
      const source = document.createElement('canvas')
      source.width = 64
      source.height = 64
      source.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(pixels), 64, 64), 0, 0)
      ctx.drawImage(source, 0, 0, 64, 64, 0, 0, 36, 36)
      return
    }
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      ctx.drawImage(image, 8, 8, 8, 8, 0, 0, 36, 36)
      ctx.drawImage(image, 40, 8, 8, 8, 0, 0, 36, 36)
    }
    image.src = DEFAULT_SKINS[id].url
  }, [id])
  return <canvas ref={ref} width={36} height={36} className="ed-template-art" aria-hidden="true" />
}

/** Mouse and keyboard reference, the help that sits under the editor. */
function Controls() {
  const mouse: Array<[string, string]> = [
    ['Arrastrar con el botón izquierdo', 'Pinta con la herramienta elegida'],
    ['Arrastrar con el botón derecho', 'Borra, o hace lo contrario de la herramienta'],
    ['Arrastrar fuera del modelo o con la rueda pulsada', 'Gira la cámara'],
    ['Rueda', 'Acerca y aleja'],
    ['Mantener Alt', 'Cuentagotas hasta que lo sueltes']
  ]
  const keys: Array<[string, string]> = [
    ['B', 'Pincel'], ['E', 'Goma'], ['G', 'Relleno'], ['S', 'Sombra'], ['I', 'Cuentagotas'], ['M', 'Espejo'], ['L', 'Capa base o exterior'],
    ['[ y ]', 'Tamaño del pincel'], ['Ctrl + Z', 'Deshacer'], ['Ctrl + Mayús + Z', 'Rehacer']
  ]
  return (
    <section className="ed-help" aria-labelledby="ed-help-title">
      <h2 id="ed-help-title" className="section-label">Controles</h2>
      <div className="ed-help-grid">
        <dl className="ed-help-list">
          {mouse.map(([what, does]) => (
            <div key={what}><dt>{what}</dt><dd>{does}</dd></div>
          ))}
        </dl>
        <dl className="ed-help-list">
          {keys.map(([key, does]) => (
            <div key={key}><dt><kbd>{key}</kbd></dt><dd>{does}</dd></div>
          ))}
        </dl>
      </div>
    </section>
  )
}

const STEPS: Array<{ target: string; title: string; body: string; points: string[] }> = [
  {
    target: 'source',
    title: 'Empieza con una skin',
    body: 'Todo arranca aquí. Abre una plantilla, suelta tu propio PNG o trae la skin actual de cualquier jugador por su nombre. También puedes empezar desde un lienzo vacío de 64×64.',
    points: ['Steve y Alex son las skins de Minecraft; el mapa UV y la guía muestran qué zona de la textura cae en cada cara.', 'Ancho usa brazos de 4 píxeles y Delgado de 3: cambia qué píxeles cubren los brazos.', 'Base o Exterior elige la capa que pintas; pulsa una parte de la figura para ocultarla.']
  },
  {
    target: 'skin',
    title: 'Tres formas de ver la misma skin',
    body: 'En 3D pintas directamente sobre el modelo y giras la cámara arrastrando fuera de él. Plano muestra la figura de frente y 2D la textura entera, píxel a píxel.',
    points: ['Lo que pintes en una vista aparece al instante en las otras.', 'El zoom y la cuadrícula te ayudan con los detalles.', 'Cuando termines, descárgala, guárdala en tu armario o póntela en tu cuenta.']
  },
  {
    target: 'tools',
    title: 'Herramientas y la capa entera',
    body: 'Pincel, goma, relleno, sombra y cuentagotas para pintar píxel a píxel; los filtros cambian toda la capa a la vez sin perder nada.',
    points: ['El botón derecho hace lo contrario: borra con el pincel y oscurece con la sombra.', 'El espejo pinta a la vez el lado contrario del cuerpo.', 'La pose solo mueve el modelo para verlo mejor: no cambia el PNG.']
  },
  {
    target: 'colour',
    title: 'El color con el que pintas',
    body: 'Elige un tono en la rueda, ajusta el brillo o escribe el valor exacto. Debajo tienes matices del color actual, paletas preparadas y los colores que has usado.',
    points: ['Guarda los recientes como paleta para reutilizarlos en otra skin.', '«En esta skin» lista los colores que ya tiene la textura.']
  },
  {
    target: 'layers',
    title: 'Apila, combina y reordena',
    body: 'Cada capa se pinta por separado y se ve encima de las de abajo. Ajusta su opacidad, ocúltala, cámbiala de orden o combínala con la de debajo.',
    points: ['Los filtros se aplican a la capa activa.', 'El PNG final junta todas las capas visibles.']
  },
  {
    target: 'skin',
    title: 'Ya está',
    body: 'Tu dibujo se guarda solo en este equipo mientras trabajas, así que puedes cerrar el launcher sin perderlo. Puedes volver a ver este tutorial con «Ver el tutorial».',
    points: []
  }
]

/** The guided tour: one panel at a time under a spotlight, with a card that explains it. */
function Tour({ step, onStep, onClose }: { step: number; onStep: (step: number) => void; onClose: () => void }) {
  const [rect, setRect] = useState<DOMRect | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const current = STEPS[step]

  useEffect(() => {
    const element = document.querySelector<HTMLElement>(`[data-tour="${current.target}"]`)
    element?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    const update = (): void => setRect(element?.getBoundingClientRect() ?? null)
    update()
    const timer = window.setTimeout(update, 350)
    const scroller = document.getElementById('content')
    scroller?.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    cardRef.current?.focus()
    return () => {
      window.clearTimeout(timer)
      scroller?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [current.target, step])

  const last = step === STEPS.length - 1
  // The card sits beside the panel, on whichever side has room
  const cardStyle = rect
    ? rect.right + 380 < window.innerWidth
      ? { top: Math.max(56, Math.min(rect.top, window.innerHeight - 380)), left: rect.right + 16 }
      : { top: Math.max(56, Math.min(rect.top, window.innerHeight - 380)), left: Math.max(16, rect.left - 376) }
    : { top: 120, left: 120 }

  return (
    <div className="tour" onKeyDown={(event) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowRight' && !last) onStep(step + 1)
      if (event.key === 'ArrowLeft' && step > 0) onStep(step - 1)
    }}>
      {rect && <div className="tour-spot" style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }} aria-hidden="true" />}
      <div ref={cardRef} className="tour-card" style={cardStyle} role="dialog" aria-modal="true" aria-labelledby="tour-title" tabIndex={-1}>
        <div className="tour-head">
          <p className="tour-step"><ImageIcon size={13} strokeWidth={2} aria-hidden="true" /> Paso {step + 1} de {STEPS.length}</p>
          <IconButton label="Cerrar el tutorial" onClick={onClose}><X size={15} strokeWidth={1.75} aria-hidden="true" /></IconButton>
        </div>
        <h2 id="tour-title" className="tour-title">{current.title}</h2>
        <p className="tour-body">{current.body}</p>
        {current.points.length > 0 && <ul className="tour-points">{current.points.map((point) => <li key={point}>{point}</li>)}</ul>}
        <div className="tour-foot">
          <div className="tour-dots" aria-hidden="true">{STEPS.map((_, index) => <span key={index} className={cx('tour-dot', index === step && 'tour-dot-on')} />)}</div>
          {!last && <Button size="sm" variant="ghost" onClick={onClose}>Saltar</Button>}
          {step > 0 && <Button size="sm" variant="secondary" onClick={() => onStep(step - 1)}>Atrás</Button>}
          <Button size="sm" variant="primary" data-autofocus="" onClick={() => (last ? onClose() : onStep(step + 1))}>{last ? 'Empezar' : 'Siguiente'}</Button>
        </div>
      </div>
    </div>
  )
}
