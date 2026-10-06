import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import './styles.css'
import App from './App'
import { SettingsProvider } from './hooks/useDashboardSettings'
import { GoogleConnectionProvider } from './hooks/useGoogleConnection'
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SettingsProvider>
      <GoogleConnectionProvider>
        <App />
      </GoogleConnectionProvider>
    </SettingsProvider>
  </React.StrictMode>,
)
