import { config, assertRuntimeConfig, getConfigWarnings } from './config'
import { createAppFetch as createRoutesFetch } from './routes'

export const createAppFetch = createRoutesFetch

export function startServer() {
  assertRuntimeConfig('serve')

  const warnings = getConfigWarnings('serve')
  warnings.forEach((warning) => {
    console.warn(`[blog-wx-bun-service] warning: ${warning}`)
  })

  const server = Bun.serve({
    port: config.port,
    idleTimeout: 30,
    fetch: createRoutesFetch(),
  })

  console.log(`[blog-wx-bun-service] listening on http://localhost:${server.port}`)
  return server
}
