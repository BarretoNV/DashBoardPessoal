import { useId, useRef, useState } from 'react'
import { Check, X } from 'lucide-react'
import type { Task } from '../types'

export function TaskCreateForm({
  onCreate,
  onCancel,
  compact = false,
  autoFocus = false,
}: {
  onCreate: (title: string, due?: string) => Promise<Task>
  onCancel?: () => void
  compact?: boolean
  autoFocus?: boolean
}) {
  const titleId = useId()
  const dueId = useId()
  const form = useRef<HTMLFormElement>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  return (
    <form
      ref={form}
      className={`task-create-form ${compact ? 'compact' : ''}`}
      aria-label="Criar tarefa"
      onSubmit={async (event) => {
        event.preventDefault()
        if (saving) return
        const data = new FormData(event.currentTarget)
        const title = String(data.get('title') ?? '').trim()
        const due = String(data.get('due') ?? '')
        if (!title) return
        setSaving(true)
        setError('')
        try {
          await onCreate(title, due || undefined)
          form.current?.reset()
          onCancel?.()
        } catch {
          setError('Não foi possível criar a tarefa. Tente novamente.')
        } finally {
          setSaving(false)
        }
      }}
    >
      <div className="task-create-heading">
        <strong>Nova tarefa</strong>
        {onCancel ? (
          <button type="button" className="icon-button" onClick={onCancel} aria-label="Cancelar nova tarefa">
            <X size={16} />
          </button>
        ) : null}
      </div>
      <label htmlFor={titleId}>Título</label>
      <input
        id={titleId}
        name="title"
        maxLength={160}
        placeholder="O que precisa ser feito?"
        autoFocus={autoFocus}
        required
        disabled={saving}
      />
      <label htmlFor={dueId}>Data <span className="muted">(opcional)</span></label>
      <input id={dueId} name="due" type="date" disabled={saving} />
      {error ? <p className="task-create-error" role="alert">{error}</p> : null}
      <button className="primary-button task-create-submit" disabled={saving}>
        <Check size={17} /> {saving ? 'Salvando…' : 'Criar tarefa'}
      </button>
    </form>
  )
}
