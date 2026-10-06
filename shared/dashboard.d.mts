export type DashboardData = { settings: import('../src/types').DashboardSettings; integrations: import('../src/types').IntegrationPreferences; tasks: import('../src/types').Task[]; habits: import('../src/types').Habit[]; 'google-task-list': string }
export type Operation = { type: string; [key: string]: unknown }
export function defaultDashboard(): DashboardData
export function validDashboard(value: unknown): value is DashboardData
export function operations(key: string, before: unknown, after: unknown): Operation[]
export function applyOperations(data: DashboardData, ops: Operation[]): DashboardData
