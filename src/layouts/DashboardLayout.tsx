import type { ReactNode } from 'react'
export function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <main className="dashboard-grid" aria-label="Visão do dia">
      {children}
    </main>
  )
}
