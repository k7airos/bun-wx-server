import { config } from '../config'
import { API_CODES } from './api-codes'
import { badRequest, forbidden, internalError, ApiError } from './errors'

export function assertAllowedSource(request: Request) {
  const appSource = request.headers.get('x-app-source')
  if (appSource && !config.allowedSources.includes(appSource)) {
    throw forbidden('非法请求来源', API_CODES.FORBIDDEN)
  }
}

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

export async function fetchWxAccessToken(appId: string, appSecret: string) {
  if (!appId || !appSecret) {
    throw badRequest('缺少凭证(appId/appSecret)')
  }

  const url = new URL('https://api.weixin.qq.com/cgi-bin/token')
  url.searchParams.set('grant_type', 'client_credential')
  url.searchParams.set('appid', appId)
  url.searchParams.set('secret', appSecret)

  const response = await fetchWithTimeout(url.toString(), { method: 'GET' }, 10000)
  const data = await response.json() as {
    access_token?: string
    expires_in?: number
    errcode?: number
    errmsg?: string
  }

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

  const formData = new FormData()
  formData.append('media', file, file.name || 'image.jpg')

  const url = new URL('https://api.weixin.qq.com/cgi-bin/material/add_material')
  url.searchParams.set('access_token', accessToken)
  url.searchParams.set('type', 'image')

  const response = await fetchWithTimeout(url.toString(), {
    method: 'POST',
    body: formData,
  })
  const data = await response.json() as {
    media_id?: string
    url?: string
    errcode?: number
    errmsg?: string
  }

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

type DraftArticle = {
  article_type: 'news' | 'newspic'
  title: string
  author?: string
  digest?: string
  content: string
  thumb_media_id?: string
  need_open_comment?: number
  image_info?: {
    image_list: Array<{ image_media_id: string }>
  }
}

export function validateDraftArticles(articles: DraftArticle[]) {
  if (!Array.isArray(articles) || articles.length === 0) {
    throw badRequest('articles 参数必须是非空数组')
  }

  return articles.map((article, index) => {
    if (!['news', 'newspic'].includes(article.article_type)) {
      throw badRequest(`articles[${index}].article_type 必须是 news 或 newspic`)
    }
    if (!article.title) {
      throw badRequest(`articles[${index}].title 不能为空`)
    }
    if (!article.content) {
      throw badRequest(`articles[${index}].content 不能为空`)
    }
    if (article.article_type === 'news' && !article.thumb_media_id) {
      throw badRequest(`articles[${index}].thumb_media_id 在 article_type=news 时必填`)
    }
    if (article.article_type === 'newspic') {
      const imageList = article.image_info?.image_list
      if (!Array.isArray(imageList) || imageList.length === 0) {
        throw badRequest(`articles[${index}].image_info 在 article_type=newspic 时必填`)
      }
    }

    return {
      ...article,
      need_open_comment: article.need_open_comment ?? 1,
    }
  })
}

export async function createWxDraft(accessToken: string, articles: DraftArticle[]) {
  if (!accessToken) {
    throw badRequest('缺少 access_token 参数')
  }

  const validatedArticles = validateDraftArticles(articles)
  const url = new URL('https://api.weixin.qq.com/cgi-bin/draft/add')
  url.searchParams.set('access_token', accessToken)

  const response = await fetchWithTimeout(url.toString(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ articles: validatedArticles }),
  })
  const data = await response.json() as {
    media_id?: string
    errcode?: number
    errmsg?: string
  }

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
