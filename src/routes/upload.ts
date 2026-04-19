import { badRequest } from '../lib/errors'
import { issueCosCredentialBodySchema, issueCosCredentialResponseSchema } from '../modules/upload/schemas'
import { issueCosCredential } from '../lib/cos'
import type { AppRouteDefinition } from './utils'

export const uploadRoutes: AppRouteDefinition[] = [
  {
    method: 'POST',
    matchPath: '/api/v1/upload/cos',
    auth: 'required',
    role: 'superAdmin',
    jsonSchema: issueCosCredentialBodySchema,
    responseSchema: issueCosCredentialResponseSchema,
    handler: async ({ auth, body, json, audit }) => {
      if (!auth) {
        throw badRequest('缺少鉴权上下文')
      }
      const payload = body as typeof issueCosCredentialBodySchema._output
      const data = await issueCosCredential({
        userId: auth.userId,
        filename: payload.filename,
        folder: payload.folder?.name ? { name: payload.folder.name } : undefined,
      })
      audit({
        action: 'upload.issue_cos_credential',
        targetType: 'cos_object',
        targetId: data.Key,
        metadata: { filename: payload.filename },
      })
      return json(data)
    },
  },
]
