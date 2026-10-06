import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { Check, Link2, Plus, Trash2, Unplug, X } from 'lucide-react'
import type { DashboardSettings, DataSource, Habit, Task } from '../types'
import { useDashboardSettings } from '../hooks/useDashboardSettings'
import { useGoogleConnection } from '../hooks/useGoogleConnection'
import { dateKey, dateLabel, weekDays } from '../services/dateService'
import { TaskCreateForm } from './TaskCreateForm'
import { BackupControls } from './BackupControls'
import { getCloudSnapshot } from '../services/cloudDashboard'
export type SettingsTab = 'settings' | 'tasks' | 'habits'
interface Props {
  initialTab: SettingsTab
  close: () => void
  tasks: Task[]
  setTasks: Dispatch<SetStateAction<Task[]>>
  habits: Habit[]
  setHabits: Dispatch<SetStateAction<Habit[]>>
  now: Date
  saved: boolean
  onComplete: (id: string, completed: boolean) => void
  onCreate: (title: string, due?: string) => Promise<Task>
  onToggleDay: (id: string, day: string) => void
  taskSource: DataSource
  taskNotice?: string
  tasksLoading: boolean
}
export function Settings({
  initialTab,
  close,
  tasks,
  setTasks,
  habits,
  setHabits,
  now,
  saved,
  onComplete,
  onCreate,
  onToggleDay,
  taskSource,
  taskNotice,
  tasksLoading,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [tab, setTab] = useState(initialTab)
  useEffect(() => {
    const element = dialog.current
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    element?.showModal()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      element?.close()
      document.body.style.overflow = overflow
      previous?.focus()
    }
  }, [])
  return (
    <dialog
      ref={dialog}
      className="settings-dialog"
      aria-labelledby="settings-title"
      onCancel={close}
      onClick={(event) => {
        if (event.target === dialog.current) {
          const rect = dialog.current.getBoundingClientRect()
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            close()
        }
      }}
    >
      <div className="dialog-content">
        <header className="dialog-header">
          <div>
            <p className="eyebrow">Do seu jeito</p>
            <h2 id="settings-title">Seu centro pessoal</h2>
          </div>
          <button className="icon-button" onClick={close} aria-label="Fechar configurações">
            <X />
          </button>
        </header>
        <nav className="settings-tabs" aria-label="Seções de configuração">
          {(['settings', 'tasks', 'habits'] as const).map((key) => (
            <button
              key={key}
              aria-current={tab === key ? 'page' : undefined}
              onClick={() => setTab(key)}
            >
              {key === 'settings' ? 'Preferências' : key === 'tasks' ? 'Tarefas' : 'Hábitos'}
            </button>
          ))}
        </nav>
        {tab === 'settings' ? (
          <>
            <Preferences />
            <BackupControls />
          </>
        ) : tab === 'tasks' ? (
          <TaskEditor
            tasks={tasks}
            setTasks={setTasks}
            onComplete={onComplete}
            onCreate={onCreate}
            taskSource={taskSource}
            taskNotice={taskNotice}
            tasksLoading={tasksLoading}
          />
        ) : (
          <HabitEditor habits={habits} setHabits={setHabits} now={now} onToggleDay={onToggleDay} />
        )}
        <p className="local-note" role="status">
          {saved
            ? getCloudSnapshot().mode === 'cloud'
              ? 'Alterações sincronizadas entre dispositivos.'
              : 'Alterações salvas neste navegador.'
            : getCloudSnapshot().mode === 'cloud'
              ? 'Consulte o estado da sincronização no painel.'
              : 'Não foi possível salvar. Suas alterações durarão apenas nesta sessão.'}
        </p>
      </div>
    </dialog>
  )
}
function Preferences() {
  const { value: settings, setValue } = useDashboardSettings()
  const [locationNotice, setLocationNotice] = useState('')
  function update<K extends keyof DashboardSettings>(key: K, value: DashboardSettings[K]) {
    setValue((old) => ({ ...old, [key]: value }))
  }
  return (
    <div className="preferences">
      <label>
        Seu nome <span className="muted">(opcional)</span>
        <input
          maxLength={40}
          value={settings.name}
          onChange={(event) => update('name', event.target.value)}
        />
      </label>
      <label>
        Formato do relógio
        <select
          value={settings.hourFormat}
          onChange={(e) => update('hourFormat', e.target.value as '12h' | '24h')}
        >
          <option value="24h">24 horas</option>
          <option value="12h">12 horas</option>
        </select>
      </label>
      <label>
        Fuso horário
        <select
          value={settings.timezone ?? 'America/Sao_Paulo'}
          onChange={(e) => update('timezone', e.target.value)}
        >
          <option value="America/Sao_Paulo">Brasília — America/Sao_Paulo</option>
          <option value="America/Manaus">Manaus — America/Manaus</option>
          <option value="America/Rio_Branco">Rio Branco — America/Rio_Branco</option>
          <option value="America/Noronha">Fernando de Noronha — America/Noronha</option>
          <option value="UTC">UTC</option>
        </select>
      </label>
      <IntegrationsPanel />
      <fieldset>
        <legend>Na sua tela</legend>
        {(
          [
            { key: 'showWeather', label: 'Mostrar clima' },
            { key: 'showTasks', label: 'Mostrar tarefas' },
            { key: 'showHabits', label: 'Mostrar hábitos' },
            { key: 'animatedBackground', label: 'Fundo animado' },
            { key: 'autoAmbient', label: 'Modo ambiente após 2 min' },
            { key: 'autoRotateTaskLists', label: 'Alternar listas automaticamente' },
            { key: 'autoScrollTasks', label: 'Rolar tarefas automaticamente' },
          ] as const
        ).map((item) => (
          <label className="toggle-row" key={item.key}>
            {item.label}
            <input
              type="checkbox"
              checked={
                item.key === 'animatedBackground'
                  ? settings.animatedBackground !== false
                  : item.key === 'autoAmbient' ||
                      item.key === 'autoRotateTaskLists' ||
                      item.key === 'autoScrollTasks'
                    ? settings[item.key] !== false
                    : settings[item.key]
              }
              onChange={(event) => update(item.key, event.target.checked)}
            />
          </label>
        ))}
        <p className="field-hint">
          O modo ambiente oculta controles após inatividade. As listas com pendências podem alternar
          a cada 30 segundos.
        </p>
      </fieldset>
      <label className="color-field">
        Cor de destaque
        <input
          type="color"
          value={settings.accent}
          onChange={(event) => update('accent', event.target.value)}
        />
      </label>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          const data = new FormData(event.currentTarget)
          update('location', {
            name: String(data.get('locationName')).trim(),
            latitude: Number(data.get('latitude')),
            longitude: Number(data.get('longitude')),
          })
          setLocationNotice('Localização atualizada.')
        }}
      >
        <fieldset>
          <legend>Localização do clima</legend>
          <p className="field-hint">Informe as coordenadas da sua cidade.</p>
          <label>
            Cidade
            <input
              name="locationName"
              defaultValue={settings.location?.name ?? ''}
              maxLength={60}
              placeholder="Nome da cidade"
              required
            />
          </label>
          <div className="coordinate-fields">
            <label>
              Latitude
              <input
                type="number"
                name="latitude"
                min="-90"
                max="90"
                step="any"
                defaultValue={settings.location?.latitude}
                placeholder="−23.5505"
                required
              />
            </label>
            <label>
              Longitude
              <input
                type="number"
                name="longitude"
                min="-180"
                max="180"
                step="any"
                defaultValue={settings.location?.longitude}
                placeholder="−46.6333"
                required
              />
            </label>
          </div>
          <button className="primary-button" type="submit">
            Salvar localização
          </button>
          <span className="field-hint" role="status">
            {locationNotice}
          </span>
        </fieldset>
      </form>
      <p className="field-hint">
        Clima fornecido por{' '}
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
          Open-Meteo
        </a>
        .
      </p>
    </div>
  )
}
function TaskEditor({
  tasks,
  setTasks,
  onComplete,
  onCreate,
  taskSource,
  taskNotice,
  tasksLoading,
}: Pick<
  Props,
  'tasks' | 'setTasks' | 'onComplete' | 'onCreate' | 'taskSource' | 'taskNotice' | 'tasksLoading'
>) {
  return (
    <div>
      <p className="field-hint">
        {taskSource === 'google'
          ? 'Crie, conclua ou reabra tarefas da lista padrão do Google.'
          : 'Tarefas com data aparecem primeiro, seguidas pelas demais prioridades.'}
      </p>
      {taskNotice && (
        <p className="integration-message" role="status">
          {taskNotice}
        </p>
      )}
      <TaskCreateForm onCreate={onCreate} />
      <div className="editor-list">
        {tasks.map((task) => (
          <div className="task-editor-row" key={task.id}>
            <input
              aria-label={`Concluir ${task.title}`}
              type="checkbox"
              checked={task.completed}
              onChange={(e) => onComplete(task.id, e.target.checked)}
            />
            {taskSource === 'local' ? (
              <input
                aria-label={`Título da tarefa ${task.title}`}
                value={task.title}
                maxLength={160}
                onChange={(e) => {
                  const title = e.target.value
                  if (title.trim())
                    setTasks((old) => old.map((t) => (t.id === task.id ? { ...t, title } : t)))
                }}
              />
            ) : (
              <span className="remote-task-title">{task.title}</span>
            )}
            {taskSource === 'local' && (
              <select
                aria-label={`Prioridade de ${task.title}`}
                value={task.priority ?? 'low'}
                onChange={(e) =>
                  setTasks((old) =>
                    old.map((t) =>
                      t.id === task.id ? { ...t, priority: e.target.value as Task['priority'] } : t,
                    ),
                  )
                }
              >
                <option value="high">Alta</option>
                <option value="medium">Média</option>
                <option value="low">Baixa</option>
              </select>
            )}
            {taskSource === 'local' && (
              <button
                className="icon-button"
                aria-label={`Excluir tarefa ${task.title}`}
                onClick={() => setTasks((old) => old.filter((t) => t.id !== task.id))}
              >
                <Trash2 size={18} />
              </button>
            )}
          </div>
        ))}
      </div>
      {tasksLoading && <p className="empty">Sincronizando tarefas…</p>}
      {!tasksLoading && !tasks.length && <p className="empty">Nada pendente.</p>}
    </div>
  )
}

function IntegrationsPanel() {
  const google = useGoogleConnection()
  const anyEnabled =
    google.connected || google.preferences.calendarEnabled || google.preferences.tasksEnabled
  const rows = [
    {
      key: 'calendar' as const,
      name: 'Google Calendar',
      connected: google.calendarConnected,
      enabled: google.preferences.calendarEnabled,
      detail: 'Leitura dos eventos da agenda principal.',
    },
    {
      key: 'tasks' as const,
      name: 'Google Tasks',
      connected: google.tasksConnected,
      enabled: google.preferences.tasksEnabled,
      detail: 'Criação, leitura e conclusão de tarefas da lista padrão.',
    },
  ]
  return (
    <fieldset className="integrations-panel">
      <legend>Integrações</legend>
      {!google.available && !google.checking && (
        <p className="integration-message">
          Configure as credenciais da API local para ativar a conexão com o Google.
        </p>
      )}
      {rows.map((row) => (
        <div className="integration-row" key={row.key}>
          <div>
            <strong>{row.name}</strong>
            <span>{row.detail}</span>
          </div>
          <span className={`connection-status ${row.connected ? 'connected' : ''}`}>
            {google.checking
              ? 'Verificando'
              : row.connected
                ? 'Conectado'
                : row.enabled
                  ? 'Reconexão necessária'
                  : 'Não conectado'}
          </span>
          <button
            className="secondary-button"
            disabled={!google.available || google.checking || google.busy !== null}
            onClick={() => void google.connect(row.key)}
          >
            <Link2 size={16} />{' '}
            {row.connected ? 'Renovar' : row.enabled ? 'Reconectar' : 'Conectar'}
          </button>
        </div>
      ))}
      {google.error && (
        <p className="integration-message" role="alert">
          {google.error}
        </p>
      )}
      {anyEnabled && (
        <button className="disconnect-button" onClick={() => void google.disconnect()}>
          <Unplug size={16} /> Desconectar Google
        </button>
      )}
      <p className="field-hint">
        A API local mantém a autorização entre reinícios e renova o acesso automaticamente. O
        refresh token é criptografado e nunca é enviado ao React. O Google Tasks solicita edição
        para permitir concluir e reabrir tarefas.
      </p>
      <p className="connection-status connected">Open-Meteo ativo sem conta</p>
    </fieldset>
  )
}
function HabitEditor({
  habits,
  setHabits,
  now,
  onToggleDay,
}: Pick<Props, 'habits' | 'setHabits' | 'now' | 'onToggleDay'>) {
  const { value: settings } = useDashboardSettings()
  const days = weekDays(now, settings.timezone)
  return (
    <div>
      <p className="field-hint">Pequenos passos, semana após semana. Marque os dias realizados.</p>
      <form
        className="add-form"
        onSubmit={(event) => {
          event.preventDefault()
          const form = event.currentTarget
          const name = String(new FormData(form).get('name')).trim()
          if (!name) return
          setHabits((old) => [
            ...old,
            { id: crypto.randomUUID(), name, target: 5, completedDays: [] },
          ])
          form.reset()
        }}
      >
        <input
          name="name"
          aria-label="Novo hábito"
          placeholder="Um hábito para cultivar"
          maxLength={60}
          required
        />
        <button className="primary-button" aria-label="Adicionar hábito">
          <Plus size={20} />
        </button>
      </form>
      {habits.map((habit) => (
        <fieldset className="habit-editor" key={habit.id}>
          <legend>{habit.name}</legend>
          <div className="habit-editor-fields">
            <label>
              Nome
              <input
                aria-label={`Nome do hábito ${habit.name}`}
                value={habit.name}
                maxLength={60}
                onChange={(event) => {
                  const name = event.target.value
                  if (name.trim())
                    setHabits((old) => old.map((h) => (h.id === habit.id ? { ...h, name } : h)))
                }}
              />
            </label>
            <label>
              Meta
              <select
                aria-label={`Meta de ${habit.name}`}
                value={habit.target}
                onChange={(event) =>
                  setHabits((old) =>
                    old.map((h) =>
                      h.id === habit.id ? { ...h, target: Number(event.target.value) } : h,
                    ),
                  )
                }
              >
                {Array.from({ length: 7 }, (_, i) => (
                  <option key={i} value={i + 1}>
                    {i + 1} dias
                  </option>
                ))}
              </select>
            </label>
            <button
              className="icon-button"
              aria-label={`Excluir hábito ${habit.name}`}
              onClick={() => setHabits((old) => old.filter((h) => h.id !== habit.id))}
            >
              <Trash2 size={18} />
            </button>
          </div>
          <div className="habit-editor-days">
            {days.map((day) => {
              const key = dateKey(day, settings.timezone)
              const completed = habit.completedDays.includes(key)
              return (
                <button
                  key={key}
                  aria-label={`${habit.name}, ${dateLabel(day, {}, settings.timezone)}`}
                  aria-pressed={completed}
                  disabled={key > dateKey(now, settings.timezone)}
                  onClick={() => onToggleDay(habit.id, key)}
                >
                  <span>
                    {dateLabel(day, { weekday: 'short' }, settings.timezone).replace('.', '')}
                  </span>
                  <span>
                    {completed ? (
                      <Check size={18} />
                    ) : (
                      dateLabel(day, { day: 'numeric' }, settings.timezone)
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        </fieldset>
      ))}
      {!habits.length && <p className="empty">Nenhum acompanhamento configurado.</p>}
    </div>
  )
}
