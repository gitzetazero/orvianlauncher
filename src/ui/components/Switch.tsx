import { cx } from './cx'

interface SwitchProps {
  checked: boolean
  label: string
  disabled?: boolean
  busy?: boolean
  onChange: (checked: boolean) => void
}

/** On/off control for settings that apply at once (a resource pack, a shader). */
export function Switch({ checked, label, disabled, busy, onChange }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-busy={busy || undefined}
      disabled={disabled || busy}
      className={cx('switch', checked && 'switch-on')}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-thumb" aria-hidden="true" />
    </button>
  )
}
