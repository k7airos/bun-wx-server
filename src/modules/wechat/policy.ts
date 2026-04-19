import { config } from '../../config'
import { API_CODES } from '../../lib/api-codes'
import { forbidden } from '../../lib/errors'
import { parseWithSchema } from '../../lib/validation'
import { createWxDraftBodySchema, type WxDraftArticle } from './schemas'

export type DraftArticle = WxDraftArticle

export function assertAllowedSource(request: Request) {
  const appSource = request.headers.get('x-app-source')
  if (appSource && !config.allowedSources.includes(appSource)) {
    throw forbidden('非法请求来源', API_CODES.FORBIDDEN)
  }
}

export function validateDraftArticles(articles: DraftArticle[]) {
  const parsed = parseWithSchema(
    createWxDraftBodySchema.shape.articles,
    articles,
    '微信草稿参数不合法',
  )

  return parsed.map(article => ({
    ...article,
    need_open_comment: article.need_open_comment ?? 1,
  }))
}
