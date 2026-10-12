import { useEffect, useRef, useState } from 'react'
import type { SkinViewer as Viewer } from 'skinview3d'
import type { Object3D, Raycaster as RaycasterType, Vector2 as Vector2Type } from 'three'
import { box, faces, PARTS, SIZE, type LayerKind, type PartId } from './layout'

export interface Pose {
  head: number
  body: number
  rightArm: number
  leftArm: number
  rightLeg: number
  leftLeg: number
  backwards: boolean
}

export const NEUTRAL_POSE: Pose = { head: 0, body: 0, rightArm: 0, leftArm: 0, rightLeg: 0, leftLeg: 0, backwards: false }

interface StrokeEvent {
  x: number
  y: number
  inverse: boolean
  phase: 'start' | 'move'
}

interface Viewport3DProps {
  pixels: Uint8ClampedArray
  version: number
  slim: boolean
  target: LayerKind
  hidden: Set<PartId>
  grid: boolean
  arrow: boolean
  zoom: number
  pose: Pose
  onStroke: (event: StrokeEvent) => void
  onStrokeEnd: () => void
}

const SCALE = 8

/** The skin as the model's texture, enlarged with a pixel grid drawn over the faces when it helps. */
function buildTexture(pixels: Uint8ClampedArray, grid: boolean, target: LayerKind, slim: boolean): HTMLCanvasElement {
  const small = document.createElement('canvas')
  small.width = SIZE
  small.height = SIZE
  small.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(pixels), SIZE, SIZE), 0, 0)
  if (!grid) return small
  const big = document.createElement('canvas')
  big.width = SIZE * SCALE
  big.height = SIZE * SCALE
  const ctx = big.getContext('2d')
  if (!ctx) return small
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(small, 0, 0, big.width, big.height)
  // Grid lines on the faces of the layer being painted: a blank skin still shows its shape
  ctx.strokeStyle = 'rgba(214, 200, 214, 0.55)'
  ctx.lineWidth = 1
  for (const part of PARTS) {
    for (const rect of Object.values(faces(box(part, target, slim)))) {
      for (let x = 0; x <= rect.w; x++) {
        ctx.beginPath()
        ctx.moveTo((rect.x + x) * SCALE + 0.5, rect.y * SCALE)
        ctx.lineTo((rect.x + x) * SCALE + 0.5, (rect.y + rect.h) * SCALE)
        ctx.stroke()
      }
      for (let y = 0; y <= rect.h; y++) {
        ctx.beginPath()
        ctx.moveTo(rect.x * SCALE, (rect.y + y) * SCALE + 0.5)
        ctx.lineTo((rect.x + rect.w) * SCALE, (rect.y + y) * SCALE + 0.5)
        ctx.stroke()
      }
    }
  }
  return big
}

const isShown = (object: Object3D): boolean => {
  for (let node: Object3D | null = object; node; node = node.parent) if (!node.visible) return false
  return true
}

/**
 * Paintable 3D model. A left press on the model paints (right press runs the tool's inverse); a
 * press off the model, or the middle button, turns the camera; the wheel zooms.
 */
export function Viewport3D({ pixels, version, slim, target, hidden, grid, arrow, zoom, pose, onStroke, onStrokeEnd }: Viewport3DProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewerRef = useRef<Viewer | null>(null)
  const toolsRef = useRef<{ raycaster: RaycasterType; pointer: Vector2Type; arrow: Object3D } | null>(null)
  const [ready, setReady] = useState(false)
  const latest = useRef({ target, onStroke, onStrokeEnd })
  latest.current = { target, onStroke, onStrokeEnd }

  useEffect(() => {
    let disposed = false
    let observer: ResizeObserver | null = null
    let cleanupPointer: (() => void) | null = null
    void Promise.all([import('skinview3d'), import('three')]).then(([lib, THREE]) => {
      const host = hostRef.current
      const canvas = canvasRef.current
      if (disposed || !host || !canvas) return
      const viewer = new lib.SkinViewer({ canvas, width: host.clientWidth, height: host.clientHeight, pixelRatio: 'match-device', fov: 45, zoom: 0.9 })
      viewer.background = null
      viewer.globalLight.intensity = 3.4
      viewer.cameraLight.intensity = 0.9
      viewer.controls.enablePan = false
      viewer.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.ROTATE }
      viewer.renderer.debug.checkShaderErrors = false
      viewer.playerWrapper.rotation.y = -0.5

      // The front arrow: a chevron on the floor in front of the character
      const shape = new THREE.Shape()
      shape.moveTo(-5, 0)
      shape.lineTo(0, -4)
      shape.lineTo(5, 0)
      shape.lineTo(5, 1.6)
      shape.lineTo(0, -2.4)
      shape.lineTo(-5, 1.6)
      shape.closePath()
      const chevron = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: 0xcfc3cd, transparent: true, opacity: 0.55, side: THREE.DoubleSide }))
      chevron.rotation.x = -Math.PI / 2
      chevron.position.set(0, -16, 7)
      viewer.playerWrapper.add(chevron)

      const raycaster = new THREE.Raycaster()
      const pointer = new THREE.Vector2()
      toolsRef.current = { raycaster, pointer, arrow: chevron }
      viewerRef.current = viewer

      // Which texture pixel is under the cursor, on the layer being painted
      const hit = (event: PointerEvent): [number, number] | null => {
        const rect = canvas.getBoundingClientRect()
        pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
        raycaster.setFromCamera(pointer, viewer.camera)
        const skin = viewer.playerObject.skin
        const meshes = [skin.head, skin.body, skin.rightArm, skin.leftArm, skin.rightLeg, skin.leftLeg].map((part) => (latest.current.target === 'base' ? part.innerLayer : part.outerLayer))
        const found = raycaster.intersectObjects(meshes, true).find((item) => isShown(item.object) && item.uv)
        if (!found?.uv) return null
        const x = Math.min(SIZE - 1, Math.floor(found.uv.x * SIZE))
        const y = Math.min(SIZE - 1, Math.floor((1 - found.uv.y) * SIZE))
        return [x, y]
      }

      let painting = false
      // Capture phase on the host: decides before the camera controls see the press
      const down = (event: PointerEvent): void => {
        if (event.button === 1) return
        const at = hit(event)
        if (!at) return
        painting = true
        viewer.controls.enabled = false
        canvas.setPointerCapture(event.pointerId)
        latest.current.onStroke({ x: at[0], y: at[1], inverse: event.button === 2, phase: 'start' })
      }
      const move = (event: PointerEvent): void => {
        if (!painting) return
        const at = hit(event)
        if (at) latest.current.onStroke({ x: at[0], y: at[1], inverse: (event.buttons & 2) !== 0, phase: 'move' })
      }
      const up = (): void => {
        if (!painting) return
        painting = false
        viewer.controls.enabled = true
        latest.current.onStrokeEnd()
      }
      const noMenu = (event: Event): void => event.preventDefault()
      host.addEventListener('pointerdown', down, { capture: true })
      host.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      host.addEventListener('contextmenu', noMenu)
      cleanupPointer = () => {
        host.removeEventListener('pointerdown', down, { capture: true })
        host.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        host.removeEventListener('contextmenu', noMenu)
      }

      observer = new ResizeObserver(() => viewer.setSize(host.clientWidth, host.clientHeight))
      observer.observe(host)
      setReady(true)
    })
    return () => {
      disposed = true
      cleanupPointer?.()
      observer?.disconnect()
      viewerRef.current?.dispose()
      viewerRef.current = null
    }
  }, [])

  // The texture follows every change of the document
  useEffect(() => {
    const viewer = viewerRef.current
    if (!ready || !viewer) return
    viewer.loadSkin(buildTexture(pixels, grid, target, slim), { model: slim ? 'slim' : 'default' })
  }, [ready, pixels, version, grid, target, slim])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!ready || !viewer) return
    const skin = viewer.playerObject.skin
    for (const part of PARTS) skin[part].visible = !hidden.has(part)
    // While painting the base, the overlay would sit in the way of the cursor
    for (const part of PARTS) skin[part].outerLayer.visible = target === 'overlay'
    if (toolsRef.current) toolsRef.current.arrow.visible = arrow
  }, [ready, hidden, arrow, target, grid])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!ready || !viewer) return
    viewer.zoom = zoom
  }, [ready, zoom])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!ready || !viewer) return
    const skin = viewer.playerObject.skin
    skin.head.rotation.y = pose.head
    skin.body.rotation.y = pose.body
    skin.rightArm.rotation.x = pose.rightArm
    skin.leftArm.rotation.x = pose.leftArm
    skin.rightLeg.rotation.x = pose.rightLeg
    skin.leftLeg.rotation.x = pose.leftLeg
    viewer.playerObject.rotation.y = pose.backwards ? Math.PI : 0
  }, [ready, pose])

  return (
    <div ref={hostRef} className="editor-3d">
      <canvas ref={canvasRef} role="img" aria-label="Modelo 3D de la skin. Pinta con el botón izquierdo y gira la cámara arrastrando fuera del modelo." />
      {!ready && <p className="editor-loading">Cargando el modelo…</p>}
    </div>
  )
}
