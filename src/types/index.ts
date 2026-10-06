export interface CalendarEvent {
  id: string
  title: string
  start: Date
  end?: Date
  category?: string
  allDay?: boolean
  source: 'google' | 'local'
  url?: string
}
export interface Task {
  id: string
  title: string
  completed: boolean
  priority?: 'low' | 'medium' | 'high'
  due?: string
  source: 'google' | 'local'
  taskListId?: string
}
export interface GoogleTaskList {
  id: string
  title: string
  updated?: string
}
export interface Habit {
  id: string
  name: string
  target: number
  completedDays: string[]
}
export interface WeatherLocation {
  name: string
  latitude: number
  longitude: number
}
export interface DashboardSettings {
  name: string
  hourFormat: '12h' | '24h'
  showWeather: boolean
  showTasks: boolean
  showHabits: boolean
  accent: string
  ambient: boolean
  autoAmbient?: boolean
  autoRotateTaskLists?: boolean
  autoScrollTasks?: boolean
  animatedBackground?: boolean
  location: WeatherLocation | null
  timezone?: string
}
export interface IntegrationPreferences {
  calendarEnabled: boolean
  tasksEnabled: boolean
}
export type DataSource = 'google' | 'local'
export interface DataStatus {
  source: DataSource
  notice?: string
}
export interface WeatherData {
  temperature: number
  code: number
  days: WeatherDay[]
  updatedAt: number
}
export interface WeatherDay {
  date: string
  code: number
  high: number
  low: number
  precipitationProbability: number
}
