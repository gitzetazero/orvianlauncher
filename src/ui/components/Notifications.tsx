import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, Bell, BellOff, Download, Package, PackageCheck, Shirt, UserX, Rocket } from 'lucide-react'
import type { LauncherNotification, NotificationKind } from '../../shared/launcher-state'
import { Button } from './Button'
import { cx } from './cx'
import { relativeTime } from './time'

const ICONS: Record<NotificationKind, ReactNode> = {
  pack: <Download size={16} strokeWidth={1.75} />,
  install: <PackageCheck size={16} strokeWidth={1.75} />,
  crash: <AlertTriangle size={16} strokeWidth={1.75} />,
  mods: <Package size={16} strokeWidth={1.75} />,
  launcher: <Rocket size={16} strokeWidth={1.75} />,
  account: <UserX size={16} strokeWidth={1.75} />,
  skin: <Shirt size={16} strokeWidth={1.75} />
}

/** Bell in the rail with the unread count; opens the list of recent launcher events. */
export function NotificationsButton({ items }: { items: LauncherNotification[] }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const titleId = useId()
  const unread = items.filter((item) => !item.read).length

  const close = (returnFocus: boolean): void => {
    setOpen(false)
    // Seen once opened: the badge clears when the list closes, not while it is being read
    if (unread > 0) void window.orvian.markNotificationsRead()
    if (returnFocus) triggerRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    panelRef.current?.focus()
    const onPointerDown = (event: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) close(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
    // close() only depends on values read at call time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const label = unread > 0 ? `Notificaciones, ${unread} sin leer` : 'Notificaciones'

  return (
    <div className="notif" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={cx('rail-item', open && 'rail-item-open')}
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => (open ? close(false) : setOpen(true))}
      >
        <Bell size={20} strokeWidth={1.75} aria-hidden="true" />
        {unread > 0 && <span className="rail-badge" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}
        <span className="rail-tip" aria-hidden="true">Notificaciones</span>
      </button>
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="notif-panel"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation()
              close(true)
            }
          }}
        >
          <div className="notif-head">
            <h2 id={titleId} className="section-label">Notificaciones</h2>
            {items.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => void window.orvian.clearNotifications()}>Borrar todo</Button>
            )}
          </div>
          {items.length === 0 ? (
            <div className="notif-empty">
              <BellOff size={22} strokeWidth={1.5} aria-hidden="true" />
              <p>No hay avisos. Aquí verás las actualizaciones, los mods que instales y los cierres inesperados.</p>
            </div>
          ) : (
            <ul className="notif-list">
              {items.map((item) => (
                <li key={item.id} className={cx('notif-item', !item.read && 'notif-item-unread', `notif-${item.kind}`)}>
                  <span className="notif-icon" aria-hidden="true">{ICONS[item.kind]}</span>
                  <div className="notif-body">
                    <p className="notif-title">{item.title}</p>
                    <p className="notif-text">{item.body}</p>
                  </div>
                  <time className="notif-time" dateTime={new Date(item.at).toISOString()}>{relativeTime(item.at)}</time>
                  {!item.read && <span className="visually-hidden">Sin leer</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
