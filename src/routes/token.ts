import { badRequest } from '../lib/errors'
import {
  generatePatBodySchema,
  generatePatResponseSchema,
  listPatResponseSchema,
  revokePatResponseSchema,
  tokenIdParamsSchema,
  tokenScopesResponseSchema,
} from '../modules/token/schemas'
import { generatePAT, listPATs, PAT_SCOPES, revokePAT } from '../lib/auth'
import type { AppRouteDefinition } from './utils'

export const tokenRoutes: AppRouteDefinition[] = [
  {
    method: 'GET',
    matchPath: '/api/v1/token/scopes',
    responseSchema: tokenScopesResponseSchema,
    handler: async ({ json }) => json({
      scopes: Object.entries(PAT_SCOPES).map(([key, value]) => ({
        key,
        label: value.label,
        paths: value.paths,
      })),
    }),
  },
  {
    method: 'POST',
    matchPath: '/api/v1/token/generate',
    auth: 'required',
    jsonSchema: generatePatBodySchema,
    responseSchema: generatePatResponseSchema,
    handler: async ({ auth, body, json, audit }) => {
      if (!auth) {
        throw badRequest('缺少鉴权上下文')
      }
      const payload = body as typeof generatePatBodySchema._output
      const scopes = payload.scopes as Array<keyof typeof PAT_SCOPES> | undefined
      const data = generatePAT(auth.userId, payload.note, scopes || ['all'], payload.expiresInDays ?? 365)
      audit({
        action: 'token.generate_pat',
        targetType: 'user',
        targetId: auth.userId,
        metadata: { scopes: scopes || ['all'], note: payload.note },
      })
      return json({
        token: data.token,
        note: data.note,
        expiresInDays: payload.expiresInDays ?? 365,
        scopes: scopes || ['all'],
        message: 'Token 生成成功，请立即复制保存，它将不会再次显示。',
      })
    },
  },
  {
    method: 'GET',
    matchPath: '/api/v1/token/list',
    auth: 'required',
    responseSchema: listPatResponseSchema,
    handler: async ({ auth, json }) => {
      if (!auth) {
        throw badRequest('缺少鉴权上下文')
      }
      return json(listPATs(auth.userId))
    },
  },
  {
    method: 'DELETE',
    matchPath: '/api/v1/token/:id',
    auth: 'required',
    paramsSchema: tokenIdParamsSchema,
    responseSchema: revokePatResponseSchema,
    handler: async ({ auth, params, json, audit }) => {
      if (!auth) {
        throw badRequest('缺少鉴权上下文')
      }
      const id = params.id
      if (!id) {
        throw badRequest('参数错误')
      }
      audit({
        action: 'token.revoke_pat',
        targetType: 'pat',
        targetId: id,
      })
      return json(revokePAT(auth.userId, id))
    },
  },
]
