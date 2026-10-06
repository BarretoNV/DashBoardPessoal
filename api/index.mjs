import { createRuntime } from '../server/runtime.mjs'
let app
export default function handler(req, res) {
  const url = new URL(req.url, 'http://internal')
  const route = url.searchParams.get('__path')
  if (route !== null) {
    url.searchParams.delete('__path')
    req.url = `/api/${route}${url.search}`
  }
  app ||= createRuntime()
  return app(req, res)
}
