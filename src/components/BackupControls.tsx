import { useState, useSyncExternalStore } from 'react'
import {
  exportDashboard,
  readBackup,
  importDashboard,
  subscribeCloud,
  getCloudSnapshot,
} from '../services/cloudDashboard'
import type { DashboardData } from '../../shared/dashboard.mjs'
export function BackupControls() {
  const cloud = useSyncExternalStore(subscribeCloud, getCloudSnapshot)
  const [pending, setPending] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')
  return (
    <section className="backup-controls" aria-label="Backup dos dados">
      <h3>Backup dos dados</h3>
      <button
        onClick={() => {
          try {
            exportDashboard()
            setError('')
          } catch (e) {
            setError((e as Error).message)
          }
        }}
      >
        Exportar backup JSON
      </button>
      {cloud.mode === 'cloud' && (
        <>
          <label>
            Importar backup (até 1 MB)
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.target.files?.[0]
                setPending(null)
                setError('')
                if (file)
                  void readBackup(file)
                    .then(setPending)
                    .catch((e) => setError(e.message))
                event.target.value = ''
              }}
            />
          </label>
          {pending && (
            <div>
              <p>
                {pending.tasks.length} tarefas e {pending.habits.length} hábitos, com preferências.
                A importação substituirá os dados sincronizados. Um backup atual será baixado antes.
              </p>
              <button
                disabled={cloud.status !== 'synced'}
                onClick={() => {
                  try {
                    importDashboard(pending)
                    setPending(null)
                  } catch (e) {
                    setError((e as Error).message)
                  }
                }}
              >
                Confirmar substituição e baixar backup
              </button>
              <button onClick={() => setPending(null)}>Cancelar</button>
            </div>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
