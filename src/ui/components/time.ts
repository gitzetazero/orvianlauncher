const relative = new Intl.RelativeTimeFormat('es', { numeric: 'auto', style: 'short' })

/** "hace 5 min", "ayer": precise enough for events the player saw recently. */
export function relativeTime(at: number, now = Date.now()): string {
  const seconds = Math.round((at - now) / 1000)
  const abs = Math.abs(seconds)
  if (abs < 45) return 'ahora'
  if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute')
  if (abs < 86_400) return relative.format(Math.round(seconds / 3600), 'hour')
  if (abs < 30 * 86_400) return relative.format(Math.round(seconds / 86_400), 'day')
  if (abs < 365 * 86_400) return relative.format(Math.round(seconds / (30 * 86_400)), 'month')
  return relative.format(Math.round(seconds / (365 * 86_400)), 'year')
}

/** "36 h", "45 min": total play time, never with seconds. */
export function formatPlayTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  if (minutes < 1) return 'menos de 1 min'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return hours < 10 && rest > 0 ? `${hours} h ${rest} min` : `${new Intl.NumberFormat('es').format(hours)} h`
}

const monthFormat = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' })
const dateFormat = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** "octubre de 2026" */
export function formatMonth(at: number): string {
  return monthFormat.format(at)
}

/** "11 oct 2026, 15:32" */
export function formatDateTime(at: number): string {
  return dateFormat.format(at)
}

const dayFormat = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' })

/** "11 oct 2026" */
export function formatDate(at: number): string {
  return dayFormat.format(at)
}
