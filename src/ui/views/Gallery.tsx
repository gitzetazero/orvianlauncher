import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { ChevronLeft, ChevronRight, ClipboardCopy, ExternalLink, FolderOpen, ImageOff, LayoutGrid, List, RotateCw, Trash2 } from 'lucide-react'
import type { ScreenshotItem } from '../../shared/ipc-contract'
import { formatBytes } from '../../shared/format'
import { Button, IconButton } from '../components/Button'
import { ConfirmDialog, Dialog } from '../components/Dialog'
import { formatDateTime, formatMonth } from '../components/time'
import { useToast } from '../components/Toast'
import { ipcErrorMessage } from '../ipcError'
import { SearchBox } from '../components/SearchBox'

type Layout = 'grid' | 'list'
type Sort = 'newest' | 'oldest' | 'size'

const SORTS: Array<[Sort, string]> = [['newest', 'Recientes'], ['oldest', 'Antiguas'], ['size', 'Tamaño']]

function monthKey(at: number): string {
  const date = new Date(at)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export default function Gallery() {
  const toast = useToast()
  const [items, setItems] = useState<ScreenshotItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [layout, setLayout] = useState<Layout>('grid')
  const [sort, setSort] = useState<Sort>('newest')
  const [month, setMonth] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [viewing, setViewing] = useState<number | null>(null)
  const [toDelete, setToDelete] = useState<ScreenshotItem | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setItems(await window.orvian.listScreenshots())
    } catch (err) {
      setError(ipcErrorMessage(err))
      setItems((current) => current ?? [])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Months that actually have captures, newest first, for the date filter
  const months = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>()
    for (const item of items ?? []) {
      const key = monthKey(item.takenAt)
      const entry = counts.get(key) ?? { label: formatMonth(item.takenAt), count: 0 }
      entry.count++
      counts.set(key, entry)
    }
    return [...counts.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [items])

  const shown = useMemo(() => {
    const query = text.trim().toLowerCase()
    const list = (items ?? []).filter((item) => (!month || monthKey(item.takenAt) === month) && (!query || item.file.toLowerCase().includes(query)))
    return [...list].sort((a, b) => (sort === 'newest' ? b.takenAt - a.takenAt : sort === 'oldest' ? a.takenAt - b.takenAt : b.size - a.size))
  }, [items, month, text, sort])

  const current = viewing !== null ? shown[viewing] : undefined

  // Arrow keys step through captures while one is open, wherever the focus is inside the viewer
  useEffect(() => {
    if (viewing === null) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'ArrowRight') setViewing((index) => (index !== null && index < shown.length - 1 ? index + 1 : index))
      if (event.key === 'ArrowLeft') setViewing((index) => (index !== null && index > 0 ? index - 1 : index))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewing, shown.length])

  const remove = async (item: ScreenshotItem): Promise<void> => {
    setToDelete(null)
    try {
      await window.orvian.deleteScreenshot(item.file)
      toast({ kind: 'success', message: 'Captura enviada a la papelera.' })
      setViewing(null)
      await load()
    } catch (err) {
      toast({ kind: 'error', message: `No se pudo borrar la captura. ${ipcErrorMessage(err)}` })
    }
  }

  const copy = (item: ScreenshotItem): void => {
    window.orvian.copyScreenshot(item.file).then(
      () => toast({ kind: 'success', message: 'Captura copiada al portapapeles.' }),
      (err: unknown) => toast({ kind: 'error', message: ipcErrorMessage(err) })
    )
  }

  return (
    <div className="view view-enter">
      <div className="view-split">
        <div className="view-col">
          <header className="view-header">
            <div>
              <h1 className="view-title">Galería</h1>
              <p className="view-lead">Las capturas que haces en el juego con F2, ordenadas y a mano.</p>
            </div>
            <div className="button-row">
              <Button icon={<FolderOpen size={16} strokeWidth={1.75} aria-hidden="true" />} onClick={() => void window.orvian.openFolder('screenshots')}>Abrir carpeta</Button>
              <IconButton label="Recargar la galería" onClick={() => void load()}>
                <RotateCw size={16} strokeWidth={1.75} aria-hidden="true" className={items === null ? 'spin' : undefined} />
              </IconButton>
            </div>
          </header>

          <div className="list-toolbar">
            <SearchBox label="Buscar por nombre de archivo" value={text} onChange={setText} />
            <p className="toolbar-count" role="status">{items ? `${shown.length} de ${items.length} capturas` : ''}</p>
          </div>

          {error && <p className="notice notice-danger" role="alert">No se pudo leer la carpeta de capturas. {error}</p>}

          {items === null ? (
            <div className="shot-grid" aria-busy="true" aria-label="Cargando capturas">
              {Array.from({ length: 9 }, (_, index) => <div key={index} className="shot-skeleton" />)}
            </div>
          ) : items.length === 0 ? (
            <div className="empty-state">
              <ImageOff size={30} strokeWidth={1.5} aria-hidden="true" />
              <p className="empty-title">Tu galería está vacía</p>
              <p className="empty-text">Pulsa F2 dentro del juego para guardar tu primera captura. Aparecerá aquí al momento.</p>
              <Button onClick={() => void window.orvian.openFolder('screenshots')} icon={<FolderOpen size={16} strokeWidth={1.75} aria-hidden="true" />}>Abrir la carpeta de capturas</Button>
            </div>
          ) : shown.length === 0 ? (
            <div className="empty-state"><p className="empty-title">Ninguna captura coincide con el filtro</p></div>
          ) : layout === 'grid' ? (
            <ul className="shot-grid">
              {shown.map((item, index) => (
                <li key={item.file} style={{ '--n': Math.min(index, 12) } as CSSProperties}>
                  <button type="button" className="shot" onClick={() => setViewing(index)} aria-label={`Ver ${item.file}, ${formatDateTime(item.takenAt)}`}>
                    <img src={item.thumbUrl} alt="" loading="lazy" decoding="async" width={480} height={270} />
                    <span className="shot-meta" aria-hidden="true">{formatDateTime(item.takenAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="row-list">
              {shown.map((item, index) => (
                <li key={item.file} className="row">
                  <button type="button" className="row-thumb" onClick={() => setViewing(index)} aria-label={`Ver ${item.file}`}>
                    <img src={item.thumbUrl} alt="" loading="lazy" decoding="async" width={96} height={54} />
                  </button>
                  <div className="row-info">
                    <span className="row-name selectable" translate="no">{item.file}</span>
                    <span className="row-meta">{formatDateTime(item.takenAt)} · {formatBytes(item.size)}</span>
                  </div>
                  <IconButton label={`Copiar ${item.file}`} onClick={() => copy(item)}>
                    <ClipboardCopy size={16} strokeWidth={1.75} aria-hidden="true" />
                  </IconButton>
                  <IconButton label={`Borrar ${item.file}`} onClick={() => setToDelete(item)}>
                    <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside className="side-panel" aria-label="Opciones de la galería">
          <section className="side-section" aria-labelledby="gallery-view">
            <h2 id="gallery-view" className="section-label">Vista</h2>
            <div className="segmented" role="group" aria-label="Vista">
              <button type="button" className="segment" aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}>
                <LayoutGrid size={14} strokeWidth={2} aria-hidden="true" /> Cuadrícula
              </button>
              <button type="button" className="segment" aria-pressed={layout === 'list'} onClick={() => setLayout('list')}>
                <List size={14} strokeWidth={2} aria-hidden="true" /> Lista
              </button>
            </div>
          </section>
          <section className="side-section" aria-labelledby="gallery-sort">
            <h2 id="gallery-sort" className="section-label">Orden</h2>
            <div className="segmented" role="group" aria-label="Orden">
              {SORTS.map(([id, label]) => (
                <button key={id} type="button" className="segment" aria-pressed={sort === id} onClick={() => setSort(id)}>{label}</button>
              ))}
            </div>
          </section>
          <section className="side-section" aria-labelledby="gallery-date">
            <h2 id="gallery-date" className="section-label">Por fecha</h2>
            {months.length === 0 ? (
              <p className="side-note">Las fechas aparecerán cuando tengas capturas.</p>
            ) : (
              <ul className="filter-list">
                <li>
                  <button type="button" className="filter-item" aria-pressed={month === null} onClick={() => setMonth(null)}>
                    <span>Todas</span><span className="filter-count">{items?.length ?? 0}</span>
                  </button>
                </li>
                {months.map(([key, entry]) => (
                  <li key={key}>
                    <button type="button" className="filter-item" aria-pressed={month === key} onClick={() => setMonth(month === key ? null : key)}>
                      <span className="filter-month">{entry.label}</span><span className="filter-count">{entry.count}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      <Dialog
        open={current !== undefined}
        size="xl"
        className="lightbox"
        title={current?.file ?? ''}
        description={current ? `${formatDateTime(current.takenAt)} · ${formatBytes(current.size)}` : undefined}
        onClose={() => setViewing(null)}
        actions={
          current && (
            <>
              <Button variant="ghost" icon={<Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />} onClick={() => setToDelete(current)}>Borrar</Button>
              <Button variant="secondary" icon={<ClipboardCopy size={16} strokeWidth={1.75} aria-hidden="true" />} onClick={() => copy(current)}>Copiar</Button>
              <Button variant="secondary" icon={<ExternalLink size={16} strokeWidth={1.75} aria-hidden="true" />} onClick={() => void window.orvian.openScreenshot(current.file)}>Abrir</Button>
            </>
          )
        }
      >
        {current && viewing !== null && (
          <div className="lightbox-stage">
            <IconButton label="Captura anterior" className="lightbox-nav lightbox-prev" disabled={viewing === 0} onClick={() => setViewing(viewing - 1)}>
              <ChevronLeft size={22} strokeWidth={1.75} aria-hidden="true" />
            </IconButton>
            <img key={current.file} src={current.url} alt={`Captura ${current.file}`} className="lightbox-image" width={1920} height={1080} decoding="async" />
            <IconButton label="Captura siguiente" className="lightbox-nav lightbox-next" disabled={viewing >= shown.length - 1} onClick={() => setViewing(viewing + 1)}>
              <ChevronRight size={22} strokeWidth={1.75} aria-hidden="true" />
            </IconButton>
            <p className="lightbox-count" aria-live="polite">{viewing + 1} / {shown.length}</p>
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={toDelete !== null}
        destructive
        title="¿Borrar esta captura?"
        description={toDelete ? <><code className="selectable" translate="no">{toDelete.file}</code> irá a la papelera de Windows; podrás recuperarla desde allí.</> : undefined}
        confirmLabel="Borrar"
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && void remove(toDelete)}
      />
    </div>
  )
}
