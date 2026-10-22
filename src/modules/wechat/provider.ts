import { config } from '../../config'
import {
  wechatAccessTokenResponseSchema,
  wechatDraftBatchGetResponseSchema,
  wechatDraftDeleteResponseSchema,
  wechatDraftGetResponseSchema,
  wechatDraftResponseSchema,
  wechatDraftUpdateResponseSchema,
  wechatMaterialResponseSchema,
} from './external-schemas'
import { internalError } from '../../lib/errors'
import { parseWithSchema } from '../../lib/validation'
import type { ZodType } from 'zod'
import type { DraftArticle, DraftUpdateArticle } from './policy'

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs = config.wxRequestTimeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    })
  }
  catch (error) {
    throw internalError('请求微信服务失败，请稍后重试', error)
  }
  finally {
    clearTimeout(timer)
  }
}

export async function requestWechatAccessToken(appId: string, appSecret: string) {
  const url = new URL('https://api.weixin.qq.com/cgi-bin/token')
  url.searchParams.set('grant_type', 'client_credential')
  url.searchParams.set('appid', appId)
  url.searchParams.set('secret', appSecret)

  const response = await fetchWithTimeout(url.toString(), { method: 'GET' }, 10000)
  return parseWithSchema(
    wechatAccessTokenResponseSchema,
    await response.json(),
    '微信 Token 响应格式异常',
  )
}

export async function uploadWechatMaterial(accessToken: string, file: File) {
  const formData = new FormData()
  formData.append('media', file, file.name || 'image.jpg')

  const url = new URL('https://api.weixin.qq.com/cgi-bin/material/add_material')
  url.searchParams.set('access_token', accessToken)
  url.searchParams.set('type', 'image')

  const response = await fetchWithTimeout(url.toString(), {
    method: 'POST',
    body: formData,
  })
  return parseWithSchema(
    wechatMaterialResponseSchema,
    await response.json(),
    '微信素材响应格式异常',
  )
}

export async function createWechatDraftRequest(accessToken: string, articles: DraftArticle[]) {
  const url = new URL('https://api.weixin.qq.com/cgi-bin/draft/add')
  url.searchParams.set('access_token', accessToken)

  const response = await fetchWithTimeout(url.toString(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ articles }),
  })
  return parseWithSchema(
    wechatDraftResponseSchema,
    await response.json(),
    '微信草稿响应格式异常',
  )
}

async function requestWechatJson<T>(
  path: string,
  accessToken: string,
  payload: Record<string, unknown>,
  schema: ZodType<T>,
  errorMessage: string,
) {
  const url = new URL(`https://api.weixin.qq.com${path}`)
  url.searchParams.set('access_token', accessToken)

  const response = await fetchWithTimeout(url.toString(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return parseWithSchema(schema, await response.json(), errorMessage)
}

export async function updateWechatDraftRequest(
  accessToken: string,
  input: { media_id: string, index: number, articles: DraftUpdateArticle },
) {
  return requestWechatJson(
    '/cgi-bin/draft/update',
    accessToken,
    { media_id: input.media_id, index: input.index, articles: input.articles },
    wechatDraftUpdateResponseSchema,
    '微信草稿更新响应格式异常',
  )
}

export async function getWechatDraftRequest(accessToken: string, mediaId: string) {
  return requestWechatJson(
    '/cgi-bin/draft/get',
    accessToken,
    { media_id: mediaId },
    wechatDraftGetResponseSchema,
    '微信草稿读取响应格式异常',
  )
}

export async function deleteWechatDraftRequest(accessToken: string, mediaId: string) {
  return requestWechatJson(
    '/cgi-bin/draft/delete',
    accessToken,
    { media_id: mediaId },
    wechatDraftDeleteResponseSchema,
    '微信草稿删除响应格式异常',
  )
}

export async function batchGetWechatDraftsRequest(
  accessToken: string,
  input: { offset: number, count: number, no_content?: boolean | number },
) {
  const payload: Record<string, unknown> = {
    offset: input.offset,
    count: input.count,
  }
  if (input.no_content !== undefined) {
    payload.no_content = input.no_content
  }

  return requestWechatJson(
    '/cgi-bin/draft/batchget',
    accessToken,
    payload,
    wechatDraftBatchGetResponseSchema,
    '微信草稿列表响应格式异常',
  )
}
