import { API_CODES } from '../../lib/api-codes'
import { badRequest, ApiError } from '../../lib/errors'
import { assertAllowedSource, type DraftArticle, validateDraftArticles } from './policy'
import {
  createWechatDraftRequest,
  requestWechatAccessToken,
  uploadWechatMaterial,
} from './provider'

export { assertAllowedSource, validateDraftArticles }
export type { DraftArticle }

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
