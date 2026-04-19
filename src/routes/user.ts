import { badRequest } from '../lib/errors'
import {
  currentUserResponseSchema,
  updateUserBodySchema,
  updateUserResponseSchema,
  userCountResponseSchema,
  userDetailBodySchema,
  userDetailResponseSchema,
  userIdParamsSchema,
} from '../modules/user/schemas'
import { getCurrentUser, getUserCount, getUserDetail, updateUserById } from '../lib/auth'
import type { AppRouteDefinition } from './utils'

export const userRoutes: AppRouteDefinition[] = [
  {
    method: 'GET',
    matchPath: '/api/v1/user/me',
    auth: 'required',
    responseSchema: currentUserResponseSchema,
    handler: async ({ auth, json }) => {
      if (!auth) {
        throw badRequest('缺少鉴权上下文')
      }
      return json(getCurrentUser(auth.userId))
    },
  },
  {
    method: 'GET',
    matchPath: '/api/v1/user/count',
    responseSchema: userCountResponseSchema,
    handler: async ({ json }) => json(getUserCount()),
  },
  {
    method: 'POST',
    matchPath: '/api/v1/user/detail',
    auth: 'required',
    jsonSchema: userDetailBodySchema,
    responseSchema: userDetailResponseSchema,
    handler: async ({ body, json }) => {
      const payload = body as typeof userDetailBodySchema._output
      return json(getUserDetail(payload.id))
    },
  },
  {
    method: 'PUT',
    matchPath: '/api/v1/user/:id',
    auth: 'required',
    paramsSchema: userIdParamsSchema,
    jsonSchema: updateUserBodySchema,
    responseSchema: updateUserResponseSchema,
    handler: async ({ auth, params, body, json, audit }) => {
      if (!auth) {
        throw badRequest('缺少鉴权上下文')
      }
      const id = params.id
      if (!id) {
        throw badRequest('id is required')
      }
      const payload = body as typeof updateUserBodySchema._output
      const data = await updateUserById(auth.role, id, payload)
      audit({
        action: 'user.update',
        targetType: 'user',
        targetId: id,
        metadata: { fields: Object.keys(payload) },
      })
      return json(data)
    },
  },
]
