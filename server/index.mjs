import { createRuntime } from './runtime.mjs'
const port = Number(process.env.API_PORT || 8787)
createRuntime().listen(port, '127.0.0.1', () => console.log('API local pronta na porta', port))
