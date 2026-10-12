import { Search, X } from 'lucide-react'
import { IconButton } from './Button'

/** Text filter with a search icon and a clear button. */
export function SearchBox({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="search-box">
      <Search size={16} strokeWidth={1.75} aria-hidden="true" className="search-icon" />
      <input type="search" className="input search-input" aria-label={label} placeholder={`${label}…`} value={value} autoComplete="off" onChange={(e) => onChange(e.target.value)} />
      {value && (
        <IconButton label="Limpiar" className="search-clear" onClick={() => onChange('')}>
          <X size={14} strokeWidth={1.75} aria-hidden="true" />
        </IconButton>
      )}
    </div>
  )
}
