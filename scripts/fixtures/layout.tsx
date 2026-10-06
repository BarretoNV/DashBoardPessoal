// Browser-only test fixture. Vite's production entry does not import this file.
import { createRoot } from 'react-dom/client'
import App from '../../src/App'
import { SettingsProvider } from '../../src/hooks/useDashboardSettings'
import { GoogleConnectionProvider } from '../../src/hooks/useGoogleConnection'
import { calendarService } from '../../src/services/calendarService'
import { storageService } from '../../src/services/storageService'
import { dashboardConfig } from '../../src/config/dashboard'
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import '../../src/styles.css'

const parameters = new URLSearchParams(location.search)
const done = parameters.has('done')
const longTitle = 'Preparar a próxima etapa do projeto e revisar todos os detalhes importantes para a semana'
calendarService.getEvents = async (start) => ({ source: 'local', events: Array.from({ length: 5 }, (_, i) => {
  const eventStart = new Date(start)
  eventStart.setHours(done ? i : 19 + i, 0, 0, 0)
  return { id: `fixture-${i}`, title: `${longTitle} ${i + 1}`, start: eventStart, end: new Date(eventStart.getTime() + 45 * 60000), category: 'Desenvolvimento', source: 'local' }
}) })
storageService.write('settings', { ...dashboardConfig, hourFormat: parameters.has('12h') ? '12h' : '24h', location: { name: 'São Pedro da Aldeia', latitude: -22.84, longitude: -42.10 }, showHabits: !parameters.has('no-habits'), showTasks: !parameters.has('no-tasks'), ambient: parameters.has('hidden') })
storageService.write('tasks', Array.from({ length: 7 }, (_, i) => ({ id: `task-${i}`, title: `${longTitle} ${i + 1}`, completed: parameters.has('completed'), priority: i < 2 ? 'high' : 'medium', source: 'local' })))
storageService.write('habits', Array.from({ length: 7 }, (_, i) => ({ id: `habit-${i}`, name: `${longTitle} ${i + 1}`, target: 5, completedDays: [] })))
createRoot(document.getElementById('root')!).render(<SettingsProvider><GoogleConnectionProvider><App/></GoogleConnectionProvider></SettingsProvider>)
