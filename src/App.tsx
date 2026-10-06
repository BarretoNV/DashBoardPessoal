import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { Crosshair, Eye, EyeOff, Maximize, Minimize, Settings2 } from 'lucide-react'
import { toggleHabitDay } from './services/habitService'
import { Clock } from './components/Clock'
import { Weather } from './components/Weather'
import { TodayAgenda } from './components/TodayAgenda'
import { NextEvent } from './components/NextEvent'
import { TaskList } from './components/TaskList'
import { WeeklyTracker } from './components/WeeklyTracker'
import { Settings, type SettingsTab } from './components/Settings'
import { BackgroundMedia } from './components/BackgroundMedia'
import { DashboardLayout } from './layouts/DashboardLayout'
import { useClock } from './hooks/useClock'
import { useCalendar } from './hooks/useCalendar'
import { useTasks } from './hooks/useTasks'
import { useHabits } from './hooks/useHabits'
import { useDashboardSettings } from './hooks/useDashboardSettings'
import { useGoogleConnection } from './hooks/useGoogleConnection'
import { useIdleAmbient } from './hooks/useIdleAmbient'
export default function App() {
  const now = useClock()
  const calendar = useCalendar(now)
  const tasks = useTasks()
  const habits = useHabits()
  const { value: settings, setValue: setSettings, saved } = useDashboardSettings()
  const google = useGoogleConnection()
  const [tab, setTab] = useState<SettingsTab | null>(null)
  const [fullscreenError, setFullscreenError] = useState('')
  const [fullscreen, setFullscreen] = useState(false)
  const { idleAmbient, activityRevision, registerActivity } = useIdleAmbient({
    enabled: settings.autoAmbient !== false,
    blocked: tab !== null,
  })
  useEffect(() => {
    const update = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', update)
    return () => document.removeEventListener('fullscreenchange', update)
  }, [])
  const ambient = settings.ambient || idleAmbient
  const completeTask = tasks.complete
  const toggleDay = (id: string, day: string) =>
    habits.setValue((old) => toggleHabitDay(old, id, day, now, settings.timezone))
  const registerInteraction = useCallback(() => {
    registerActivity()
    if (settings.ambient) setSettings((old) => old.ambient ? { ...old, ambient: false } : old)
  }, [registerActivity, setSettings, settings.ambient])
  const toggleAmbient = () => {
    registerActivity()
    setSettings((old) => ({ ...old, ambient: !ambient }))
  }
  return (
    <div
      className={`app-shell ${ambient ? 'ambient' : ''}`}
      style={{ '--accent': settings.accent } as CSSProperties}
      onPointerDownCapture={registerInteraction}
      onKeyDownCapture={registerInteraction}
    >
      <BackgroundMedia enabled={settings.animatedBackground !== false} />
      <header className="topbar">
        <div className="brand">
          <Crosshair size={24} />
          <span>
            CENTRO DE COMANDO<span className="brand-divider">/</span>
            <span className="brand-secondary">PAINEL PESSOAL</span>
          </span>
        </div>
        <div className="toolbar">
          <button
            className={`ambient-button ${ambient ? 'active' : ''}`}
            aria-pressed={ambient}
            aria-label={ambient ? 'Mostrar controles' : 'Ocultar controles'}
            aria-describedby="controls-description"
            title="Esconde botões de edição e detalhes auxiliares. Tarefas e hábitos continuam interativos."
            onClick={toggleAmbient}
          >
            {ambient ? <Eye size={17} /> : <EyeOff size={17} />}
            <span className="control-label">
              {ambient ? 'Mostrar controles' : 'Ocultar controles'}
            </span>
          </button>
          {!ambient && (
            <>
              <button
                className="icon-button fullscreen-button"
                aria-label={fullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
                onClick={async () => {
                  try {
                    if (document.fullscreenElement) await document.exitFullscreen()
                    else await document.documentElement.requestFullscreen()
                    setFullscreen(Boolean(document.fullscreenElement))
                    setFullscreenError('')
                  } catch {
                    setFullscreenError('Use F11 para abrir em tela cheia.')
                  }
                }}
              >
                {fullscreen ? <Minimize size={19} /> : <Maximize size={19} />}
              </button>
              <button
                className="icon-button"
                aria-label="Abrir configurações"
                onClick={() => setTab('settings')}
              >
                <Settings2 size={20} />
              </button>
            </>
          )}
        </div>
      </header>
      <span className="sr-only" id="controls-description">
        Esconde botões de edição e detalhes auxiliares. Tarefas e hábitos continuam interativos.
      </span>
      <DashboardLayout>
        <section className="overview">
          <Clock now={now} />
          <Weather />
        </section>
        <NextEvent
          event={calendar.next}
          now={now}
          loading={calendar.loading}
          error={calendar.error}
          tomorrowFirst={calendar.tomorrowFirst}
          source={calendar.source}
        />
        <TodayAgenda
          events={calendar.visible}
          allDayEvents={calendar.allDay}
          next={calendar.next}
          now={now}
          loading={calendar.loading}
          error={calendar.error}
          source={calendar.source}
          notice={calendar.notice}
        />
        {settings.showTasks && (
          <TaskList
            key={ambient ? 'tasks-ambient' : 'tasks-controls'}
            tasks={tasks.value}
            lists={tasks.lists}
            tasksByList={tasks.tasksByList}
            selectedListId={tasks.selectedListId}
            unreadListIds={tasks.unreadListIds}
            onSelectList={tasks.selectList}
            onRotateList={tasks.rotateList}
            onMarkListSeen={tasks.markListSeen}
            now={now}
            activityRevision={activityRevision}
            settingsOpen={tab !== null}
            autoRotate={settings.autoRotateTaskLists !== false}
            autoScroll={settings.autoScrollTasks !== false}
            ambient={ambient}
            onEdit={() => setTab('tasks')}
            onComplete={completeTask}
            onUpdate={tasks.update}
            onCreate={tasks.create}
            source={tasks.source}
            notice={tasks.notice}
            loading={tasks.loading}
          />
        )}
        {settings.showHabits && (
          <WeeklyTracker
            habits={habits.value}
            now={now}
            ambient={ambient}
            onEdit={() => setTab('habits')}
            onToggleDay={toggleDay}
            editing={tab !== null}
          />
        )}
      </DashboardLayout>
      <footer className="footer">
        <span>
          <span className="status-dot" />
          Visão do dia
        </span>
        {!ambient && (
          <span>
            {now.getFullYear()} <span className="footer-divider">/</span> CENTRO PESSOAL
          </span>
        )}
      </footer>
      {(!saved || !tasks.saved || !habits.saved || !google.saved) && (
        <p className="save-notice" role="status">
          Não foi possível salvar. Suas alterações durarão apenas nesta sessão.
        </p>
      )}
      {fullscreenError && (
        <p role="status" className="save-notice">
          {fullscreenError}
        </p>
      )}
      {tab && (
        <Settings
          initialTab={tab}
          close={() => setTab(null)}
          tasks={tasks.value}
          setTasks={tasks.setValue}
          habits={habits.value}
          setHabits={habits.setValue}
          now={now}
          saved={saved && tasks.saved && habits.saved && google.saved}
          taskSource={tasks.source}
          taskNotice={tasks.notice}
          tasksLoading={tasks.loading}
          onComplete={completeTask}
          onCreate={tasks.create}
          onToggleDay={toggleDay}
        />
      )}
    </div>
  )
}
