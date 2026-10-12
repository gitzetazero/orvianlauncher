import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { Ban, Check, Globe, History, LogIn, Pencil, RefreshCw, Save, Star, Trash2, Upload } from 'lucide-react'
import type { SkinHistoryItem, SkinLibraryItem, SkinProfile, SkinVariant } from '../../shared/ipc-contract'
import type { LauncherState } from '../../shared/launcher-state'
import { Button, IconButton } from '../components/Button'
import { ConfirmDialog, Dialog } from '../components/Dialog'
import { cx } from '../components/cx'
import { Field } from '../components/Field'
import { Skin3D } from '../components/Skin3D'
import { CapePreview, SkinViewer } from '../components/SkinViewer'
import { formatDate, relativeTime } from '../components/time'
import { useToast } from '../components/Toast'
import { useLauncherActions } from '../hooks/useLauncherActions'
import { ipcErrorMessage } from '../ipcError'

const VARIANT_LABEL: Record<SkinVariant, string> = { classic: 'Ancho', slim: 'Delgado' }
const SOURCE_LABEL: Record<SkinHistoryItem['sources'][number], string> = { launcher: 'Este launcher', labynet: 'LabyNet', crafty: 'Crafty.gg', namemc: 'NameMC' }

/** The Locker: the skin and cape the account wears, and a wardrobe of saved skins to switch between. */
export default function Locker({ state }: { state: LauncherState }) {
  const { perform } = useLauncherActions()

  if (!state.account) {
    return (
      <div className="view view-enter">
        <div className="view-inner">
          <h1 className="view-title">Armario</h1>
          <div className="empty-state">
            <p className="empty-title">Inicia sesión para ver tu skin</p>
            <p className="empty-text">Tu skin y tus capas pertenecen a tu cuenta de Minecraft. Entra con Microsoft para cambiarlas desde aquí.</p>
            <Button variant="primary" icon={<LogIn size={16} strokeWidth={1.75} aria-hidden="true" />} onClick={() => void perform('login')}>Iniciar sesión</Button>
          </div>
        </div>
      </div>
    )
  }
  return <Wardrobe key={state.account.uuid} />
}

function Wardrobe() {
  const toast = useToast()
  const [profile, setProfile] = useState<SkinProfile | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [library, setLibrary] = useState<SkinLibraryItem[] | null>(null)
  const [history, setHistory] = useState<SkinHistoryItem[] | null>(null)
  const [editing, setEditing] = useState<{ item: SkinLibraryItem; isNew: boolean } | null>(null)
  const [toDelete, setToDelete] = useState<SkinLibraryItem | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const [syncing, setSyncing] = useState(false)
  const loadHistory = useCallback(async () => {
    try {
      setHistory(await window.orvian.listSkinHistory())
    } catch {
      setHistory((current) => current ?? [])
    }
  }, [])

  /** Brings in the account's older skins from the public history, then shows the merged list. */
  const syncHistory = useCallback(async (quiet: boolean) => {
    setSyncing(true)
    try {
      await window.orvian.syncSkinHistory()
    } catch (err) {
      if (!quiet) toast({ kind: 'error', message: `No se pudo consultar el historial público. ${ipcErrorMessage(err)}` })
    } finally {
      setSyncing(false)
      void loadHistory()
    }
  }, [loadHistory, toast])

  useEffect(() => {
    void syncHistory(true)
  }, [syncHistory])

  /** NameMC opens in its own window; the player may have to pass Cloudflare's check there. */
  const [nameMc, setNameMc] = useState(false)
  const syncNameMc = async (): Promise<void> => {
    setNameMc(true)
    try {
      const { found, added } = await window.orvian.syncNameMcHistory()
      toast({
        kind: found === 0 ? 'info' : 'success',
        message: found === 0 ? 'NameMC no muestra skins en tu perfil.' : added > 0 ? `${added === 1 ? 'Una skin nueva' : `${added} skins nuevas`} de NameMC en tu historial.` : `NameMC conoce ${found === 1 ? 'una skin' : `${found} skins`} y ya estaban en tu historial.`
      })
    } catch (err) {
      toast({ kind: 'error', message: ipcErrorMessage(err) })
    } finally {
      setNameMc(false)
      void loadHistory()
    }
  }

  // Loading the profile also records the skin worn now, so the history follows it
  const loadProfile = useCallback(async () => {
    setProfileError(null)
    try {
      setProfile(await window.orvian.getSkinProfile())
    } catch (err) {
      setProfileError(ipcErrorMessage(err))
    }
    void loadHistory()
  }, [loadHistory])

  const loadLibrary = useCallback(async () => {
    try {
      setLibrary(await window.orvian.listSkins())
    } catch (err) {
      toast({ kind: 'error', message: ipcErrorMessage(err) })
      setLibrary((current) => current ?? [])
    }
  }, [toast])

  useEffect(() => {
    void loadProfile()
    void loadLibrary()
  }, [loadProfile, loadLibrary])

  /** Runs one account change at a time and keeps the screen in step with what Minecraft reports back. */
  const run = async (key: string, action: () => Promise<void>): Promise<void> => {
    if (busy) return
    setBusy(key)
    try {
      await action()
    } catch (err) {
      toast({ kind: 'error', message: ipcErrorMessage(err) })
    } finally {
      setBusy(null)
    }
  }

  const apply = (item: SkinLibraryItem): Promise<void> =>
    run(`apply:${item.id}`, async () => {
      setProfile(await window.orvian.applySkin(item.id))
      toast({ kind: 'success', message: `Ahora llevas «${item.name}».` })
      void loadHistory()
    })

  const applyFromHistory = (item: SkinHistoryItem): Promise<void> =>
    run(`history:${item.hash}`, async () => {
      setProfile(await window.orvian.applySkinHistory(item.hash))
      toast({ kind: 'success', message: 'Has vuelto a ponerte esa skin.' })
      void loadHistory()
    })

  const saveFromHistory = (item: SkinHistoryItem): Promise<void> =>
    run(`history-save:${item.hash}`, async () => {
      const saved = await window.orvian.saveSkinHistory(item.hash)
      await loadLibrary()
      toast({ kind: 'success', message: `Guardada en tu armario como «${saved.name}».` })
    })

  const removeFromHistory = (item: SkinHistoryItem): Promise<void> =>
    run(`history-delete:${item.hash}`, async () => {
      await window.orvian.deleteSkinHistory(item.hash)
      await loadHistory()
    })

  const importSkin = (): Promise<void> =>
    run('import', async () => {
      const result = await window.orvian.importSkin()
      if (result.canceled || !result.item) return
      await loadLibrary()
      setEditing({ item: result.item, isNew: true })
    })

  const saveCurrent = (): Promise<void> =>
    run('save-current', async () => {
      const item = await window.orvian.saveCurrentSkin()
      await loadLibrary()
      toast({ kind: 'success', message: `Guardada en tu armario como «${item.name}».` })
    })

  const setCape = (capeId: string | null): Promise<void> =>
    run(`cape:${capeId ?? 'none'}`, async () => {
      setProfile(await window.orvian.setCape(capeId))
    })

  const toggleFavorite = (item: SkinLibraryItem): Promise<void> =>
    run(`fav:${item.id}`, async () => {
      await window.orvian.updateSkin(item.id, { favorite: !item.favorite })
      await loadLibrary()
    })

  const activeCape = profile?.capes.find((cape) => cape.active) ?? null
  const favorites = (library ?? []).filter((item) => item.favorite)
  const recent = [...(library ?? [])].sort((a, b) => b.addedAt - a.addedAt)

  return (
    <div className="view view-enter">
      <div className="view-inner view-wide">
        <header className="view-header">
          <div>
            <h1 className="view-title">Armario</h1>
            <p className="view-lead">Tu aspecto en Orvian. Los cambios se guardan en tu cuenta de Minecraft y los demás los verán al volver a entrar al servidor.</p>
          </div>
        </header>

        <div className="locker">
          <section className="locker-current" aria-labelledby="current-skin">
            <div className="panel-head">
              <h2 id="current-skin" className="section-label">Skin actual</h2>
              <IconButton label="Volver a cargar tu skin" onClick={() => void loadProfile()}>
                <RefreshCw size={15} strokeWidth={1.75} aria-hidden="true" className={profile === null && !profileError ? 'spin' : undefined} />
              </IconButton>
            </div>
            <div className="locker-stage">
              {profileError ? (
                <div className="locker-error" role="alert">
                  <p>{profileError}</p>
                  <Button size="sm" onClick={() => void loadProfile()}>Reintentar</Button>
                </div>
              ) : profile === null ? (
                <div className="locker-loading" aria-busy="true" aria-label="Cargando tu skin" />
              ) : profile.skin ? (
                <Skin3D src={profile.skin.url} variant={profile.skin.variant} capeSrc={activeCape?.url ?? null} label={`Skin de ${profile.name} en 3D`} />
              ) : (
                <p className="locker-default">Tu cuenta usa la skin por defecto de Minecraft (Steve o Alex).</p>
              )}
            </div>
            <div className="locker-tools">
              {profile?.skin && <span className="locker-variant">Modelo {VARIANT_LABEL[profile.skin.variant].toLowerCase()}</span>}
              <Button size="sm" variant="secondary" icon={<Save size={15} strokeWidth={1.75} aria-hidden="true" />} loading={busy === 'save-current'} disabled={!profile?.skin || (busy !== null && busy !== 'save-current')} onClick={() => void saveCurrent()}>
                Guardar en el armario
              </Button>
            </div>
          </section>

          <div className="locker-side">
            <div className="locker-top">
              <section className="locker-upload" aria-labelledby="upload-skin">
                <h2 id="upload-skin" className="section-label">Subir skin</h2>
                <button type="button" className="dropzone" disabled={busy !== null} onClick={() => void importSkin()}>
                  <Upload size={22} strokeWidth={1.75} aria-hidden="true" />
                  <span className="dropzone-title">Elegir un PNG</span>
                  <span className="dropzone-sub">64×64 o 64×32 píxeles</span>
                </button>
              </section>

              <section className="locker-capes" aria-labelledby="capes-title">
                <h2 id="capes-title" className="section-label">Capas</h2>
                {profile && profile.capes.length === 0 ? (
                  <p className="side-note">Tu cuenta no tiene capas. Las capas de eventos y de Minecraft aparecerán aquí cuando las consigas.</p>
                ) : (
                  <ul className="cape-list" aria-label="Elegir capa">
                    <li>
                      <button type="button" className="cape" aria-pressed={profile !== null && !activeCape} disabled={!profile || busy !== null} onClick={() => void setCape(null)}>
                        <Ban size={20} strokeWidth={1.5} aria-hidden="true" />
                        <span className="cape-name">Sin capa</span>
                      </button>
                    </li>
                    {(profile?.capes ?? []).map((cape) => (
                      <li key={cape.id}>
                        <button type="button" className="cape" aria-pressed={cape.active} disabled={busy !== null} onClick={() => void setCape(cape.id)} title={cape.alias}>
                          <CapePreview src={cape.url} label="" scale={3} />
                          <span className="cape-name">{cape.alias}</span>
                          {busy === `cape:${cape.id}` && <span className="visually-hidden">Cambiando…</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <SkinShelf
              title="Favoritas"
              titleId="fav-title"
              items={favorites}
              empty="Marca una skin con la estrella para tenerla siempre a mano."
              busy={busy}
              onApply={(item) => void apply(item)}
              onFavorite={(item) => void toggleFavorite(item)}
              onEdit={(item) => setEditing({ item, isNew: false })}
              onDelete={setToDelete}
            />
            <SkinShelf
              title="Tu armario"
              titleId="all-title"
              items={recent}
              loading={library === null}
              empty="Sube una skin o guarda la que llevas para empezar tu colección."
              busy={busy}
              onApply={(item) => void apply(item)}
              onFavorite={(item) => void toggleFavorite(item)}
              onEdit={(item) => setEditing({ item, isNew: false })}
              onDelete={setToDelete}
            />
            <HistoryShelf
              items={history}
              busy={busy}
              syncing={syncing}
              onSync={() => void syncHistory(false)}
              nameMcBusy={nameMc}
              onNameMc={() => void syncNameMc()}
              onApply={(item) => void applyFromHistory(item)}
              onSave={(item) => void saveFromHistory(item)}
              onRemove={(item) => void removeFromHistory(item)}
            />
          </div>
        </div>
      </div>

      {editing && (
        <SkinEditor
          key={editing.item.id}
          item={editing.item}
          isNew={editing.isNew}
          busy={busy !== null}
          onClose={() => setEditing(null)}
          onSave={async (patch, andApply) => {
            try {
              const updated = await window.orvian.updateSkin(editing.item.id, patch)
              await loadLibrary()
              setEditing(null)
              if (andApply) await apply(updated)
            } catch (err) {
              toast({ kind: 'error', message: ipcErrorMessage(err) })
            }
          }}
        />
      )}

      <ConfirmDialog
        open={toDelete !== null}
        destructive
        title="¿Quitar esta skin del armario?"
        description={toDelete ? `«${toDelete.name}» se borrará de tu armario en este equipo. La skin que llevas puesta no cambia.` : undefined}
        confirmLabel="Quitar"
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          const item = toDelete
          setToDelete(null)
          if (item) void run(`delete:${item.id}`, async () => {
            await window.orvian.deleteSkin(item.id)
            await loadLibrary()
          })
        }}
      />
    </div>
  )
}

interface ShelfProps {
  title: string
  titleId: string
  items: SkinLibraryItem[]
  loading?: boolean
  empty: string
  busy: string | null
  onApply: (item: SkinLibraryItem) => void
  onFavorite: (item: SkinLibraryItem) => void
  onEdit: (item: SkinLibraryItem) => void
  onDelete: (item: SkinLibraryItem) => void
}

function SkinShelf({ title, titleId, items, loading, empty, busy, onApply, onFavorite, onEdit, onDelete }: ShelfProps) {
  return (
    <section className="shelf" aria-labelledby={titleId}>
      <h2 id={titleId} className="section-label">{title}</h2>
      {loading ? (
        <div className="shelf-row" aria-busy="true" aria-label="Cargando">
          {Array.from({ length: 4 }, (_, index) => <div key={index} className="skin-card skin-card-skeleton" />)}
        </div>
      ) : items.length === 0 ? (
        <p className="side-note">{empty}</p>
      ) : (
        <ul className="shelf-row">
          {items.map((item, index) => (
            <li key={item.id} className="skin-card" style={{ '--n': Math.min(index, 10) } as CSSProperties}>
              <IconButton label={item.favorite ? `Quitar ${item.name} de favoritas` : `Añadir ${item.name} a favoritas`} className={cx('skin-star', item.favorite && 'skin-star-on')} aria-pressed={item.favorite} disabled={busy !== null} onClick={() => onFavorite(item)}>
                <Star size={14} strokeWidth={2} fill={item.favorite ? 'currentColor' : 'none'} aria-hidden="true" />
              </IconButton>
              <SkinViewer src={item.url} variant={item.variant} scale={4} label={`Skin ${item.name}`} className="skin-viewer skin-viewer-card" />
              <p className="skin-card-name" translate="no">{item.name}</p>
              <p className="skin-card-meta">{VARIANT_LABEL[item.variant]} · {relativeTime(item.addedAt)}</p>
              <div className="skin-card-actions">
                <Button size="sm" variant="primary" icon={<Check size={14} strokeWidth={2} aria-hidden="true" />} loading={busy === `apply:${item.id}`} disabled={busy !== null && busy !== `apply:${item.id}`} onClick={() => onApply(item)} aria-label={`Usar ${item.name}`}>
                  Usar
                </Button>
                <IconButton label={`Editar ${item.name}`} disabled={busy !== null} onClick={() => onEdit(item)}>
                  <Pencil size={14} strokeWidth={1.75} aria-hidden="true" />
                </IconButton>
                <IconButton label={`Quitar ${item.name}`} disabled={busy !== null} onClick={() => onDelete(item)}>
                  <Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

interface HistoryShelfProps {
  items: SkinHistoryItem[] | null
  busy: string | null
  syncing: boolean
  onSync: () => void
  nameMcBusy: boolean
  onNameMc: () => void
  onApply: (item: SkinHistoryItem) => void
  onSave: (item: SkinHistoryItem) => void
  onRemove: (item: SkinHistoryItem) => void
}

/** Skins the account has worn, newest first, as recorded by the launcher. */
function HistoryShelf({ items, busy, syncing, onSync, nameMcBusy, onNameMc, onApply, onSave, onRemove }: HistoryShelfProps) {
  return (
    <section className="shelf" aria-labelledby="history-title">
      <div className="shelf-head">
        <div className="panel-head">
          <h2 id="history-title" className="section-label">Historial</h2>
          <div className="shelf-head-actions">
            <Button size="sm" variant="secondary" icon={<Globe size={14} strokeWidth={1.75} aria-hidden="true" />} loading={nameMcBusy} disabled={nameMcBusy} onClick={onNameMc}>
              Traer historial de NameMC
            </Button>
            <IconButton label="Actualizar el historial" disabled={syncing} onClick={onSync}>
              <RefreshCw size={15} strokeWidth={1.75} aria-hidden="true" className={syncing ? 'spin' : undefined} />
            </IconButton>
          </div>
        </div>
        <p className="side-note">
          Las skins que ha llevado tu cuenta, juntando los historiales públicos de{' '}
          <a href="https://laby.net" onClick={(event) => { event.preventDefault(); void window.orvian.openExternal('https://laby.net') }}>LabyNet</a>,{' '}
          <a href="https://crafty.gg" onClick={(event) => { event.preventDefault(); void window.orvian.openExternal('https://crafty.gg') }}>Crafty.gg</a>
          {' '}y, si lo pides, NameMC, con lo que apunta este launcher. Cada servicio solo conoce las skins que llegó a ver.
        </p>
        {nameMcBusy && (
          <p className="side-note" role="status">
            Leyendo tu perfil de NameMC y la fecha de cada skin. Si aparece la comprobación de Cloudflare, complétala en esa ventana y el launcher seguirá solo.
          </p>
        )}
      </div>
      {items === null ? (
        <div className="shelf-row" aria-busy="true" aria-label="Cargando">
          {Array.from({ length: 3 }, (_, index) => <div key={index} className="skin-card skin-card-skeleton" />)}
        </div>
      ) : items.length === 0 ? (
        <p className="side-note">Todavía no hay historial: aparecerá en cuanto el launcher vea tu skin.</p>
      ) : (
        <ul className="shelf-row">
          {items.map((item, index) => (
            <li key={item.hash} className={item.current ? 'skin-card skin-card-current' : 'skin-card'} style={{ '--n': Math.min(index, 10) } as CSSProperties}>
              <span className="skin-history-icon" aria-hidden="true"><History size={13} strokeWidth={2} /></span>
              <SkinViewer src={item.url} variant={item.variant} scale={4} label={item.current ? 'Skin que llevas ahora' : item.firstSeenAt > 0 ? `Skin puesta ${relativeTime(item.firstSeenAt)}` : 'Skin de tu historial, sin fecha'} className="skin-viewer skin-viewer-card" />
              <p className="skin-card-name">{item.current ? 'La llevas ahora' : item.firstSeenAt > 0 ? `Puesta ${relativeTime(item.firstSeenAt)}` : 'Sin fecha'}</p>
              <p className="skin-card-meta">{VARIANT_LABEL[item.variant]}{item.firstSeenAt > 0 ? ` · ${formatDate(item.firstSeenAt)}` : ''}</p>
              <p className="skin-card-meta skin-card-sources">{item.sources.map((source) => SOURCE_LABEL[source]).join(' · ')}</p>
              <div className="skin-card-actions">
                <Button size="sm" variant="primary" icon={<Check size={14} strokeWidth={2} aria-hidden="true" />} loading={busy === `history:${item.hash}`} disabled={item.current || (busy !== null && busy !== `history:${item.hash}`)} onClick={() => onApply(item)}>
                  {item.current ? 'Puesta' : 'Usar'}
                </Button>
                <IconButton label="Guardar en el armario" disabled={busy !== null} onClick={() => onSave(item)}>
                  <Save size={14} strokeWidth={1.75} aria-hidden="true" />
                </IconButton>
                <IconButton label="Quitar del historial" disabled={busy !== null || item.current} onClick={() => onRemove(item)}>
                  <Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

interface EditorProps {
  item: SkinLibraryItem
  isNew: boolean
  busy: boolean
  onClose: () => void
  onSave: (patch: { name: string; variant: SkinVariant }, andApply: boolean) => Promise<void>
}

/** Name the skin and pick its arm model before it joins the wardrobe (or right after importing it). */
function SkinEditor({ item, isNew, busy, onClose, onSave }: EditorProps) {
  const [name, setName] = useState(item.name)
  const [variant, setVariant] = useState<SkinVariant>(item.variant)
  const [saving, setSaving] = useState<'save' | 'apply' | null>(null)
  const valid = name.trim().length > 0 && name.trim().length <= 40

  const save = async (andApply: boolean): Promise<void> => {
    setSaving(andApply ? 'apply' : 'save')
    await onSave({ name: name.trim(), variant }, andApply)
    setSaving(null)
  }

  return (
    <Dialog
      open
      size="md"
      title={isNew ? 'Nueva skin en tu armario' : 'Editar skin'}
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" disabled={!valid || busy} loading={saving === 'save'} onClick={() => void save(false)}>Guardar</Button>
          <Button variant="primary" data-autofocus="" disabled={!valid || busy} loading={saving === 'apply'} onClick={() => void save(true)}>Guardar y usar</Button>
        </>
      }
    >
      <div className="skin-editor">
        <SkinViewer src={item.url} variant={variant} scale={7} label={`Vista previa de ${name || 'la skin'}`} className="skin-viewer skin-viewer-editor" />
        <div className="form-stack">
          <Field label="Nombre" error={valid ? null : 'Escribe un nombre de hasta 40 caracteres.'}>
            {(props) => <input {...props} className="input" maxLength={40} value={name} autoComplete="off" spellCheck={false} onChange={(e) => setName(e.target.value)} />}
          </Field>
          <fieldset className="radio-group">
            <legend className="field-label">Modelo de brazos</legend>
            {(['classic', 'slim'] as const).map((id) => (
              <label key={id} className="radio-row">
                <input type="radio" name="skin-variant" value={id} checked={variant === id} onChange={() => setVariant(id)} />
                <span>{VARIANT_LABEL[id]}<small>{id === 'classic' ? 'Brazos de 4 píxeles (Steve)' : 'Brazos de 3 píxeles (Alex)'}</small></span>
              </label>
            ))}
          </fieldset>
        </div>
      </div>
    </Dialog>
  )
}
