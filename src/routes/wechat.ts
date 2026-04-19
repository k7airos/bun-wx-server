import {
  createWxDraftBodySchema,
  fetchWxTokenBodySchema,
  uploadWxMaterialFormSchema,
  wxDraftResponseSchema,
  wxMaterialResponseSchema,
  wxTokenResponseSchema,
} from '../modules/wechat/schemas'
import { createWxDraft, fetchWxAccessToken, uploadWxMaterial } from '../lib/wechat'
import type { AppRouteDefinition } from './utils'

export const wechatRoutes: AppRouteDefinition[] = [
  {
    method: 'POST',
    matchPath: '/api/v1/wx/cgi-bin/token',
    auth: 'required',
    sourceCheck: true,
    jsonSchema: fetchWxTokenBodySchema,
    responseSchema: wxTokenResponseSchema,
    handler: async ({ body, json, audit }) => {
      const payload = body as typeof fetchWxTokenBodySchema._output
      const data = await fetchWxAccessToken(payload.appId, payload.appSecret)
      audit({
        action: 'wechat.fetch_access_token',
        metadata: { appId: payload.appId },
      })
      return json(data)
    },
  },
  {
    method: 'POST',
    matchPath: '/api/v1/wx/cgi-bin/material/add_material',
    auth: 'required',
    sourceCheck: true,
    formSchema: uploadWxMaterialFormSchema,
    responseSchema: wxMaterialResponseSchema,
    handler: async ({ form, json, audit }) => {
      const payload = form as typeof uploadWxMaterialFormSchema._output
      const data = await uploadWxMaterial(payload.access_token, payload.type, payload.media)
      audit({
        action: 'wechat.upload_material',
        targetType: 'wechat_material',
        targetId: data.media_id || null,
      })
      return json(data)
    },
  },
  {
    method: 'POST',
    matchPath: '/api/v1/wx/cgi-bin/draft/add',
    auth: 'required',
    sourceCheck: true,
    jsonSchema: createWxDraftBodySchema,
    responseSchema: wxDraftResponseSchema,
    handler: async ({ body, json, audit }) => {
      const payload = body as typeof createWxDraftBodySchema._output
      const data = await createWxDraft(payload.access_token, payload.articles)
      audit({
        action: 'wechat.create_draft',
        targetType: 'wechat_draft',
        targetId: data.media_id || null,
        metadata: { articleCount: payload.articles.length },
      })
      return json(data)
    },
  },
]
