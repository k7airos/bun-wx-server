import { API_CODES } from '../../lib/api-codes'
import { badRequest, ApiError } from '../../lib/errors'
import {
  assertAllowedSource,
  normalizeDraftUpdateArticles,
  type DraftArticle,
  type DraftUpdateArticle,
  validateDraftArticles,
} from './policy'
import {
  batchGetWechatDraftsRequest,
  createWechatDraftRequest,
  deleteWechatDraftRequest,
  getWechatDraftRequest,
  requestWechatAccessToken,
  updateWechatDraftRequest,
  uploadWechatMaterial,
} from './provider'

export { assertAllowedSource, normalizeDraftUpdateArticles, validateDraftArticles }
export type { DraftArticle, DraftUpdateArticle }

export async function fetchWxAccessToken(appId: string, appSecret: string) {
  if (!appId || !appSecret) {
    throw badRequest('缺少凭证(appId/appSecret)')
  }

  const data = await requestWechatAccessToken(appId, appSecret)
  if (data.errcode && data.errcode !== 0) {
    throw new ApiError(400, API_CODES.VALIDATION_ERROR, data.errmsg || '获取微信 Token 失败', {
      wxErrcode: data.errcode,
      wxErrmsg: data.errmsg,
    })
  }

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
  }
}

export async function uploadWxMaterial(accessToken: string, type: string, file: File) {
  if (!accessToken) {
    throw badRequest('缺少 access_token 参数')
  }
  if (type !== 'image') {
    throw badRequest('仅支持 type=image')
  }
  if (!file) {
    throw badRequest('缺少 media 文件')
  }

  const data = await uploadWechatMaterial(accessToken, file)
  if (data.errcode && data.errcode !== 0) {
    throw new ApiError(400, API_CODES.NETWORK_ERROR, data.errmsg || '上传素材失败', {
      wxErrcode: data.errcode,
      wxErrmsg: data.errmsg,
    })
  }

  return {
    media_id: data.media_id,
    url: data.url,
  }
}

export async function createWxDraft(accessToken: string, articles: DraftArticle[]) {
  if (!accessToken) {
    throw badRequest('缺少 access_token 参数')
  }

  const validatedArticles = validateDraftArticles(articles)
  const data = await createWechatDraftRequest(accessToken, validatedArticles)
  if (data.errcode && data.errcode !== 0) {
    throw new ApiError(400, API_CODES.NETWORK_ERROR, data.errmsg || '新增草稿失败', {
      wxErrcode: data.errcode,
      wxErrmsg: data.errmsg,
    })
  }

  return {
    media_id: data.media_id,
  }
}

export async function updateWxDraft(
  accessToken: string,
  input: { media_id: string, index: number, articles: unknown },
) {
  if (!accessToken) {
    throw badRequest('缺少 access_token 参数')
  }
  if (!input.media_id) {
    throw badRequest('缺少 media_id 参数')
  }
  if (!Number.isInteger(input.index) || input.index < 0) {
    throw badRequest('index 必须是非负整数')
  }

  const articles = normalizeDraftUpdateArticles(input.articles)
  if (!articles || typeof articles !== 'object') {
    throw badRequest('缺少 articles 参数')
  }

  const data = await updateWechatDraftRequest(accessToken, {
    media_id: input.media_id,
    index: input.index,
    articles,
  })
  if (data.errcode && data.errcode !== 0) {
    throw new ApiError(400, API_CODES.NETWORK_ERROR, data.errmsg || '更新草稿失败', {
      wxErrcode: data.errcode,
      wxErrmsg: data.errmsg,
    })
  }

  return data
}

export async function getWxDraft(accessToken: string, mediaId: string) {
  if (!accessToken) {
    throw badRequest('缺少 access_token 参数')
  }
  if (!mediaId) {
    throw badRequest('缺少 media_id 参数')
  }

  const data = await getWechatDraftRequest(accessToken, mediaId)
  if (data.errcode && data.errcode !== 0) {
    throw new ApiError(400, API_CODES.NETWORK_ERROR, data.errmsg || '读取草稿失败', {
      wxErrcode: data.errcode,
      wxErrmsg: data.errmsg,
    })
  }

  return data
}

export async function deleteWxDraft(accessToken: string, mediaId: string) {
  if (!accessToken) {
    throw badRequest('缺少 access_token 参数')
  }
  if (!mediaId) {
    throw badRequest('缺少 media_id 参数')
  }

  const data = await deleteWechatDraftRequest(accessToken, mediaId)
  if (data.errcode && data.errcode !== 0) {
    throw new ApiError(400, API_CODES.NETWORK_ERROR, data.errmsg || '删除草稿失败', {
      wxErrcode: data.errcode,
      wxErrmsg: data.errmsg,
    })
  }

  return data
}

export async function listWxDrafts(
  accessToken: string,
  input: { offset: number, count: number, no_content?: boolean | number },
) {
  if (!accessToken) {
    throw badRequest('缺少 access_token 参数')
  }
  if (!Number.isInteger(input.offset) || input.offset < 0) {
    throw badRequest('offset 必须是非负整数')
  }
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > 20) {
    throw badRequest('count 必须是 1 至 20 的整数')
  }

  const data = await batchGetWechatDraftsRequest(accessToken, input)
  if (data.errcode && data.errcode !== 0) {
    throw new ApiError(400, API_CODES.NETWORK_ERROR, data.errmsg || '获取草稿列表失败', {
      wxErrcode: data.errcode,
      wxErrmsg: data.errmsg,
    })
  }

  return data
}
