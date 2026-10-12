import { useState, type CSSProperties } from 'react'
import { Maximize2 } from 'lucide-react'
import type { NewsItem } from '../../shared/launcher-state'
import { IconButton } from './Button'
import { cx } from './cx'
import { Dialog } from './Dialog'

const relative = new Intl.RelativeTimeFormat('es', { numeric: 'auto' })

/** "hace 3 días": the news come from release dates, so a coarse unit is enough. */
export function relativeDate(iso: string | undefined, now = Date.now()): string {
  if (!iso) return ''
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return ''
  const days = Math.round((time - now) / 86_400_000)
  if (Math.abs(days) < 1) return 'hoy'
  if (Math.abs(days) < 30) return relative.format(days, 'day')
  if (Math.abs(days) < 365) return relative.format(Math.round(days / 30), 'month')
  return relative.format(Math.round(days / 365), 'year')
}

const PREVIEW_NOTES = 3

/** Release cards in the news feed: each version as a lit tile, with all its notes one click away. */
export function NewsList({ items, latest, installed, images = [] }: { items: NewsItem[]; latest: string | null; installed: string | null; images?: string[] }) {
  const [open, setOpen] = useState<NewsItem | null>(null)
  return (
    <section className="news" aria-labelledby="news-title">
      <h2 id="news-title" className="section-label">Noticias</h2>
      {items.length === 0 ? (
        <p className="empty-note">Aún no hay novedades publicadas.</p>
      ) : (
        <div className="news-grid">
          {items.map((item, index) => (
            <NewsCard
              key={item.version}
              item={item}
              index={index}
              image={images.length > 0 ? images[index % images.length] : null}
              flag={item.version === latest && latest !== installed ? '¡Nueva versión!' : item.version === installed ? 'Instalada' : index === 0 ? 'Última' : null}
              onOpen={() => setOpen(item)}
            />
          ))}
        </div>
      )}
      <Dialog open={open !== null} size="md" title={open ? `Orvian v${open.version}` : ''} description={open ? relativeDate(open.publishedAt) || undefined : undefined} onClose={() => setOpen(null)}>
        {open && (open.notes.length === 0 ? <p className="empty-note">Sin notas para esta versión.</p> : <ul className="news-notes news-notes-full">{open.notes.map((note, i) => <li key={i}>{note}</li>)}</ul>)}
      </Dialog>
    </section>
  )
}

function NewsCard({ item, index, flag, image, onOpen }: { item: NewsItem; index: number; flag: string | null; image: string | null; onOpen: () => void }) {
  const notes = item.notes.slice(0, PREVIEW_NOTES)
  const date = relativeDate(item.publishedAt)
  const titleId = `news-${item.version.replace(/[^\w-]/g, '-')}`

  return (
    <article className={cx('news-card', index % 3 === 1 && 'news-card-steel', index % 3 === 2 && 'news-card-ember')} style={{ '--i': index } as CSSProperties} aria-labelledby={titleId}>
      <span className={cx('news-art', image && 'news-art-photo')} aria-hidden="true">
        {image && <img src={image} alt="" width={480} height={270} loading="lazy" decoding="async" />}
        <span className="news-art-version" translate="no">{item.version}</span>
      </span>
      {flag && <span className={cx('news-flag', flag === 'Instalada' && 'news-flag-quiet')}>{flag}</span>}
      <div className="news-body">
        <h3 id={titleId} className="news-title" translate="no">
          <img src="./logo-64.png" alt="" width={20} height={20} draggable={false} />
          Orvian v{item.version}
        </h3>
        {notes.length === 0 ? (
          <p className="news-empty">Sin notas para esta versión.</p>
        ) : (
          <ul className="news-notes">
            {notes.map((note, noteIndex) => <li key={noteIndex}>{note}</li>)}
          </ul>
        )}
        <div className="news-foot">
          {date && <time className="news-date" dateTime={item.publishedAt}>{date}</time>}
          {item.notes.length > PREVIEW_NOTES && <span className="news-more">+{item.notes.length - PREVIEW_NOTES} cambios</span>}
        </div>
      </div>
      <IconButton label={`Ver todas las notas de la v${item.version}`} className="news-open" onClick={onOpen}>
        <Maximize2 size={14} strokeWidth={2} aria-hidden="true" />
      </IconButton>
    </article>
  )
}
