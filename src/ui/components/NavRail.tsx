import type { ReactNode } from 'react'
import { Home, Image, Layers, Package, Paintbrush, Settings, Shirt, UploadCloud } from 'lucide-react'
import type { LauncherNotification } from '../../shared/launcher-state'
import { cx } from './cx'
import { NotificationsButton } from './Notifications'

export type ViewId = 'home' | 'locker' | 'editor' | 'mods' | 'packs' | 'gallery' | 'settings' | 'admin'

export const VIEW_LABELS: Record<ViewId, string> = {
  home: 'Inicio',
  locker: 'Armario',
  editor: 'Editor',
  mods: 'Mods',
  packs: 'Recursos',
  gallery: 'Galería',
  settings: 'Ajustes',
  admin: 'Publicar'
}

const ICONS: Record<ViewId, ReactNode> = {
  home: <Home size={20} strokeWidth={1.75} aria-hidden="true" />,
  locker: <Shirt size={20} strokeWidth={1.75} aria-hidden="true" />,
  editor: <Paintbrush size={20} strokeWidth={1.75} aria-hidden="true" />,
  mods: <Package size={20} strokeWidth={1.75} aria-hidden="true" />,
  packs: <Layers size={20} strokeWidth={1.75} aria-hidden="true" />,
  gallery: <Image size={20} strokeWidth={1.75} aria-hidden="true" />,
  settings: <Settings size={20} strokeWidth={1.75} aria-hidden="true" />,
  admin: <UploadCloud size={20} strokeWidth={1.75} aria-hidden="true" />
}

interface NavRailProps {
  view: ViewId
  isAdmin: boolean
  notifications: LauncherNotification[]
  onNavigate: (view: ViewId) => void
}

/** The vertical rail: identity on top, the player's places in the middle, settings at the foot. */
export function NavRail({ view, isAdmin, notifications, onNavigate }: NavRailProps) {
  const item = (id: ViewId): ReactNode => (
    <li key={id}>
      <button type="button" className={cx('rail-item', view === id && 'rail-item-active')} aria-label={VIEW_LABELS[id]} aria-current={view === id ? 'page' : undefined} onClick={() => onNavigate(id)}>
        {ICONS[id]}
        <span className="rail-tip" aria-hidden="true">{VIEW_LABELS[id]}</span>
      </button>
    </li>
  )

  return (
    <nav className="rail" aria-label="Principal">
      <div className="rail-logo">
        <img src="./logo-64.png" alt="" width={34} height={34} draggable={false} />
      </div>
      <ul className="rail-group">
        {item('home')}
        {item('locker')}
        {item('editor')}
        <li>
          <NotificationsButton items={notifications} />
        </li>
      </ul>
      <span className="rail-divider" aria-hidden="true" />
      <ul className="rail-group">
        {item('mods')}
        {item('packs')}
        {item('gallery')}
        {isAdmin && item('admin')}
      </ul>
      <ul className="rail-group rail-foot">{item('settings')}</ul>
    </nav>
  )
}
