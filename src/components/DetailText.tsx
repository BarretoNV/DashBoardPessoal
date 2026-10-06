import { useId } from 'react'

/** Full text remains available on hover and keyboard focus when the visible line is clipped. */
export function DetailText({ text, focusable = false }: { text: string; focusable?: boolean }) {
  const id = useId()
  return (
    <span
      className="detail-text"
      tabIndex={focusable ? 0 : undefined}
      aria-describedby={focusable ? id : undefined}
    >
      <span className="text-ellipsis">{text}</span>
      <span className="text-tooltip" id={id} role="tooltip">
        {text}
      </span>
    </span>
  )
}
