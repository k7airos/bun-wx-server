import {
  batchGetWxDraftBodySchema,
  createWxDraftBodySchema,
  deleteWxDraftBodySchema,
  fetchWxTokenBodySchema,
  getWxDraftBodySchema,
  updateWxDraftBodySchema,
  uploadWxMaterialFormSchema,
  wxDraftBatchGetResponseSchema,
  wxDraftDeleteResponseSchema,
  wxDraftGetResponseSchema,
  wxDraftResponseSchema,
  wxDraftUpdateResponseSchema,
  wxMaterialResponseSchema,
  wxTokenResponseSchema,
} from '../modules/wechat/schemas'
import {
  buildRequestFingerprint,
  createWxDraft,
  deleteWxDraft,
  fetchWxAccessToken,
  getWxDraft,
  listWxDrafts,
  readIdempotencyKey,
  resolveIdempotencyScope,
  runIdempotentWrite,
  updateWxDraft,
  uploadWxMaterial,
} from '../lib/wechat'
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
    handler: async ({ request, body, json, audit, auth }) => {
      const payload = body as typeof createWxDraftBodySchema._output
      const idempotencyKey = readIdempotencyKey(request)
      const scopeKey = resolveIdempotencyScope(request, auth)
      const outcome = await runIdempotentWrite({
        idempotencyKey,
        scopeKey,
        operation: 'draft/add',
        fingerprint: buildRequestFingerprint('draft/add', { articles: payload.articles }),
        execute: () => createWxDraft(payload.access_token, payload.articles),
      })
      audit({
        action: 'wechat.create_draft',
        targetType: 'wechat_draft',
        targetId: outcome.data.media_id || null,
        metadata: {
          articleCount: payload.articles.length,
          idempotencyKey,
          replayed: outcome.replayed,
        },
      })
      return json(outcome.data)
    },
  },
  {
    method: 'POST',
    matchPath: '/api/v1/wx/cgi-bin/draft/update',
    auth: 'required',
    sourceCheck: true,
    jsonSchema: updateWxDraftBodySchema,
    responseSchema: wxDraftUpdateResponseSchema,
    handler: async ({ request, body, json, audit, auth }) => {
      const payload = body as typeof updateWxDraftBodySchema._output
      const idempotencyKey = readIdempotencyKey(request)
      const scopeKey = resolveIdempotencyScope(request, auth)
      const outcome = await runIdempotentWrite({
        idempotencyKey,
        scopeKey,
        operation: 'draft/update',
        fingerprint: buildRequestFingerprint('draft/update', {
          media_id: payload.media_id,
          index: payload.index,
          articles: payload.articles,
        }),
        execute: () => updateWxDraft(payload.access_token, {
          media_id: payload.media_id,
          index: payload.index,
          articles: payload.articles,
        }),
      })
      audit({
        action: 'wechat.update_draft',
        targetType: 'wechat_draft',
        targetId: payload.media_id,
        metadata: {
          index: payload.index,
          idempotencyKey,
          replayed: outcome.replayed,
        },
      })
      return json(outcome.data)
    },
  },
  {
    method: 'POST',
    matchPath: '/api/v1/wx/cgi-bin/draft/get',
    auth: 'required',
    sourceCheck: true,
    jsonSchema: getWxDraftBodySchema,
    responseSchema: wxDraftGetResponseSchema,
    handler: async ({ body, json, audit }) => {
      const payload = body as typeof getWxDraftBodySchema._output
      const data = await getWxDraft(payload.access_token, payload.media_id)
      audit({
        action: 'wechat.get_draft',
        targetType: 'wechat_draft',
        targetId: payload.media_id,
      })
      return json(data)
    },
  },
  {
    method: 'POST',
    matchPath: '/api/v1/wx/cgi-bin/draft/delete',
    auth: 'required',
    sourceCheck: true,
    jsonSchema: deleteWxDraftBodySchema,
    responseSchema: wxDraftDeleteResponseSchema,
    handler: async ({ body, json, audit }) => {
      const payload = body as typeof deleteWxDraftBodySchema._output
      const data = await deleteWxDraft(payload.access_token, payload.media_id)
      audit({
        action: 'wechat.delete_draft',
        targetType: 'wechat_draft',
        targetId: payload.media_id,
      })
      return json(data)
    },
  },
  {
    method: 'POST',
    matchPath: '/api/v1/wx/cgi-bin/draft/batchget',
    auth: 'required',
    sourceCheck: true,
    jsonSchema: batchGetWxDraftBodySchema,
    responseSchema: wxDraftBatchGetResponseSchema,
    handler: async ({ body, json, audit }) => {
      const payload = body as typeof batchGetWxDraftBodySchema._output
      const data = await listWxDrafts(payload.access_token, {
        offset: payload.offset,
        count: payload.count,
        no_content: payload.no_content,
      })
      audit({
        action: 'wechat.list_drafts',
        targetType: 'wechat_draft',
        metadata: {
          offset: payload.offset,
          count: payload.count,
        },
      })
      return json(data)
    },
  },
]
