import { config } from '../config'
import { z } from 'zod'
import type { AppRouteDefinition } from './utils'

export const systemRoutes: AppRouteDefinition[] = [
  {
    method: 'GET',
    matchPath: '/health',
    responseSchema: z.object({ status: z.literal('ok') }),
    handler: async ({ json }) => json({ status: 'ok' }),
  },
  {
    method: 'GET',
    matchPath: '/ready',
    responseSchema: z.object({
      status: z.literal('ok'),
      databasePath: z.string(),
    }),
    handler: async ({ json }) => json({
      status: 'ok',
      databasePath: config.databasePath,
    }),
  },
]
