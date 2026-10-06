export function ProgressBar({
  value,
  target,
  label,
}: {
  value: number
  target: number
  label: string
}) {
  return (
    <div
      className="progress-track"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={target}
      aria-valuenow={Math.min(value, target)}
    >
      <span style={{ width: `${Math.min(value / target, 1) * 100}%` }} />
    </div>
  )
}
