import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { Folder, FolderOpen, Layers, Lock, Plus, RotateCw, Sparkles, Trash2 } from 'lucide-react'
import type { PackItem, PackKind, PackList } from '../../shared/ipc-contract'
import { formatBytes } from '../../shared/format'
import { Badge } from '../components/Badge'
import { Button, IconButton } from '../components/Button'
import { ConfirmDialog } from '../components/Dialog'
import { Switch } from '../components/Switch'
import { relativeTime } from '../components/time'
import { useToast } from '../components/Toast'
import { ipcErrorMessage } from '../ipcError'

const TABS: Array<{ id: PackKind; label: string }> = [
  { id: 'resourcepacks', label: 'Resource packs' },
  { id: 'shaderpacks', label: 'Shaders' }
]

/** Resource packs and shader packs: what is in the folders, what is switched on, and room to add more. */
export default function Packs({ gameBusy }: { gameBusy: boolean }) {
  const [tab, setTab] = useState<PackKind>('resourcepacks')

  return (
    <div className="view view-enter">
      <div className="view-inner">
        <header className="view-header">
          <div>
            <h1 className="view-title">Recursos</h1>
            <p className="view-lead">Cambia el aspecto del juego con resource packs y shaders. Los que trae el modpack son oficiales y no se pueden quitar ni desactivar. Los cambios se aplican la próxima vez que abras Minecraft.</p>
          </div>
        </header>

        <div className="tabs" role="tablist" aria-label="Tipo de pack">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`packs-tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`packs-panel-${id}`}
              tabIndex={tab === id ? 0 : -1}
              className="tab"
              onClick={() => setTab(id)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                  event.preventDefault()
                  const next = id === 'resourcepacks' ? 'shaderpacks' : 'resourcepacks'
                  setTab(next)
                  document.getElementById(`packs-tab-${next}`)?.focus()
                }
              }}
            >
              {id === 'resourcepacks' ? <Layers size={15} strokeWidth={1.75} aria-hidden="true" /> : <Sparkles size={15} strokeWidth={1.75} aria-hidden="true" />}
              {label}
            </button>
          ))}
        </div>

        {gameBusy && <p className="notice notice-info" role="status">Minecraft está abierto: podrás activar o borrar packs cuando lo cierres, porque el juego guarda sus opciones al salir.</p>}

        {TABS.map(({ id }) => (
          <div key={id} role="tabpanel" id={`packs-panel-${id}`} aria-labelledby={`packs-tab-${id}`} hidden={tab !== id}>
            {tab === id && <PackPanel kind={id} gameBusy={gameBusy} />}
          </div>
        ))}
      </div>
    </div>
  )
}

function PackPanel({ kind, gameBusy }: { kind: PackKind; gameBusy: boolean }) {
  const toast = useToast()
  const [list, setList] = useState<PackList | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<PackItem | null>(null)
  const noun = kind === 'resourcepacks' ? 'resource pack' : 'shader'

  const load = useCallback(async () => {
    setError(null)
    try {
      setList(await window.orvian.listPacks(kind))
    } catch (err) {
      setError(ipcErrorMessage(err))
      setList((current) => current ?? { items: [], canToggle: false })
    }
  }, [kind])

  useEffect(() => {
    void load()
  }, [load])

  const toggle = async (item: PackItem, enabled: boolean): Promise<void> => {
    setBusy(item.name)
    try {
      // Only one shader can be active: switching one on replaces the other
      await window.orvian.setPackEnabled(kind, item.name, enabled)
      await load()
    } catch (err) {
      toast({ kind: 'error', message: ipcErrorMessage(err) })
    } finally {
      setBusy(null)
    }
  }

  const add = async (): Promise<void> => {
    try {
      const { added, skipped = [] } = await window.orvian.addPacks(kind)
      if (added.length > 0) {
        toast({ kind: 'success', message: added.length === 1 ? `${added[0]} añadido.` : `${added.length} packs añadidos.` })
        await load()
      }
      if (skipped.length > 0) toast({ kind: 'info', message: `No se reemplazó ${skipped.join(', ')}: ${skipped.length === 1 ? 'es un pack oficial' : 'son packs oficiales'} del modpack.` })
    } catch (err) {
      toast({ kind: 'error', message: ipcErrorMessage(err) })
    }
  }

  const remove = async (item: PackItem): Promise<void> => {
    setToDelete(null)
    try {
      await window.orvian.deletePack(kind, item.name)
      toast({ kind: 'success', message: `${item.name} enviado a la papelera.` })
      await load()
    } catch (err) {
      toast({ kind: 'error', message: ipcErrorMessage(err) })
    }
  }

  const folder = kind === 'resourcepacks' ? 'resourcepacks' : 'shaders'
  const active = list?.items.filter((item) => item.enabled).length ?? 0

  return (
    <>
      <div className="list-toolbar">
        <p className="toolbar-count" role="status">
          {list ? `${list.items.length} ${list.items.length === 1 ? noun : `${noun}s`}${list.canToggle ? ` · ${active} ${active === 1 ? 'activo' : 'activos'}` : ''}` : ''}
        </p>
        <div className="button-row">
          <Button variant="primary" icon={<Plus size={16} strokeWidth={2} aria-hidden="true" />} onClick={() => void add()}>Añadir .zip</Button>
          <Button icon={<FolderOpen size={16} strokeWidth={1.75} aria-hidden="true" />} onClick={() => void window.orvian.openFolder(folder)}>Abrir carpeta</Button>
          <IconButton label="Recargar la lista" onClick={() => void load()}>
            <RotateCw size={16} strokeWidth={1.75} aria-hidden="true" className={list === null ? 'spin' : undefined} />
          </IconButton>
        </div>
      </div>

      {kind === 'shaderpacks' && list && !list.canToggle && (
        <p className="notice notice-info">Para elegir shaders desde aquí, abre una vez el menú de shaders dentro del juego (Opciones › Vídeo › Shaders). Mientras tanto puedes añadirlos y borrarlos.</p>
      )}
      {kind === 'resourcepacks' && list && list.items.length > 1 && (
        <p className="side-note">El último pack que actives queda por encima de los demás.</p>
      )}
      {error && <p className="notice notice-danger" role="alert">No se pudo leer la carpeta. {error}</p>}

      {list === null ? (
        <div className="skeleton-list" aria-busy="true" aria-label="Cargando">
          {Array.from({ length: 5 }, (_, index) => <div key={index} className="skeleton-row" />)}
        </div>
      ) : list.items.length === 0 ? (
        <div className="empty-state">
          {kind === 'resourcepacks' ? <Layers size={30} strokeWidth={1.5} aria-hidden="true" /> : <Sparkles size={30} strokeWidth={1.5} aria-hidden="true" />}
          <p className="empty-title">{kind === 'resourcepacks' ? 'No tienes resource packs' : 'No tienes shaders'}</p>
          <p className="empty-text">Descarga un pack compatible con Minecraft 1.20.1 en formato .zip y añádelo aquí.</p>
          <Button variant="primary" icon={<Plus size={16} strokeWidth={2} aria-hidden="true" />} onClick={() => void add()}>Añadir .zip</Button>
        </div>
      ) : (
        <ul className="row-list">
          {list.items.map((item, index) => (
            <li key={item.name} className={item.enabled ? 'row row-active' : 'row'} style={{ '--n': Math.min(index, 12) } as CSSProperties}>
              <span className="row-icon" aria-hidden="true">
                {item.isFolder ? <Folder size={18} strokeWidth={1.75} /> : kind === 'resourcepacks' ? <Layers size={18} strokeWidth={1.75} /> : <Sparkles size={18} strokeWidth={1.75} />}
              </span>
              <div className="row-info">
                <span className="row-name selectable" translate="no">{item.name}</span>
                <span className="row-meta">
                  {item.isOfficial && <Badge tone="info">Del modpack</Badge>}
                  {item.isFolder ? 'Carpeta · ' : ''}{formatBytes(item.size)} · modificado {relativeTime(item.modifiedAt)}
                </span>
              </div>
              {item.isOfficial ? (
                <span className="row-lock" title="Pack oficial del modpack: no se puede cambiar ni borrar">
                  <Lock size={14} strokeWidth={2} aria-hidden="true" />
                  {item.enabled ? 'Activo' : 'Oficial'}
                </span>
              ) : list.canToggle && (
                <Switch
                  checked={item.enabled}
                  label={`${item.enabled ? 'Desactivar' : 'Activar'} ${item.name}`}
                  disabled={gameBusy || (busy !== null && busy !== item.name)}
                  busy={busy === item.name}
                  onChange={(value) => void toggle(item, value)}
                />
              )}
              {!item.isOfficial && (
                <IconButton label={`Borrar ${item.name}`} disabled={gameBusy} onClick={() => setToDelete(item)}>
                  <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        destructive
        title={`¿Borrar este ${noun}?`}
        description={toDelete ? <><code className="selectable" translate="no">{toDelete.name}</code> irá a la papelera de Windows; podrás recuperarlo desde allí.</> : undefined}
        confirmLabel="Borrar"
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && void remove(toDelete)}
      />
    </>
  )
}
