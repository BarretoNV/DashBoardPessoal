export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener(
    'load',
    () => {
      void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {
        // Installation is optional; a failed registration must not block the dashboard.
        console.warn('Não foi possível preparar a página sem conexão.')
      })
    },
    { once: true },
  )
}
