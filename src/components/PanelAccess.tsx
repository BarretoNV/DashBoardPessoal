import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import {
  getCloudSnapshot,
  subscribeCloud,
  initializeCloud,
  retryCloud,
  logoutPanel,
} from '../services/cloudDashboard'
export function PanelAccess({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(subscribeCloud, getCloudSnapshot)
  const [error, setError] = useState('')
  useEffect(() => {
    void initializeCloud()
  }, [])
  if (state.mode === 'loading' || (state.mode === 'cloud' && state.authenticated && !state.data))
    return (
      <main className="access-panel">
        <p>Carregando seu painel…</p>
      </main>
    )
  if (state.mode === 'error')
    return (
      <main className="access-panel">
        <h1>Painel indisponível</h1>
        <p>{state.message}</p>
        <button onClick={() => window.location.reload()}>Tentar novamente</button>
      </main>
    )
  if (state.mode === 'cloud' && !state.authenticated) {
    const loginError = new URLSearchParams(window.location.search).get('login')
    return (
      <main className="access-panel">
        <h1>Seu centro pessoal</h1>
        <p>Entre com sua conta autorizada para acessar o painel.</p>
        {loginError && (
          <p role="alert">
            {loginError === 'denied'
              ? 'Esta conta não tem acesso ao painel.'
              : 'Não foi possível entrar. Tente novamente.'}
          </p>
        )}
        <p>{state.message}</p>
        <a className="primary-action" href="/api/login/start">
          Entrar com Google
        </a>
      </main>
    )
  }
  return (
    <>
      {state.mode === 'cloud' && (
        <aside className="sync-bar" aria-label="Sincronização">
          <span role="status">
            {state.status === 'saving'
              ? 'Salvando…'
              : state.status === 'error'
                ? 'Falha ao sincronizar'
                : 'Sincronizado'}
          </span>
          {state.status === 'error' && (
            <>
              <span>{state.message}</span>
              <button onClick={retryCloud}>Tentar novamente</button>
            </>
          )}
          <button onClick={() => void logoutPanel().catch((e) => setError(e.message))}>
            Sair do painel
          </button>
          {error && <span role="alert">{error}</span>}
        </aside>
      )}
      {children}
    </>
  )
}
