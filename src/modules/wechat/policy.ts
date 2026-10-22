import { config } from '../../config'
import { API_CODES } from '../../lib/api-codes'
import { forbidden } from '../../lib/errors'
import { parseWithSchema } from '../../lib/validation'
import {
  createWxDraftBodySchema,
  type WxDraftArticle,
  type WxDraftUpdateArticle,
} from './schemas'

export type DraftArticle = WxDraftArticle
export type DraftUpdateArticle = WxDraftUpdateArticle

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

/**
 * 微信草稿更新一次只替换一篇文章，这里把单篇对象、数组、`{ articles: [...] }`
 * 三种入参统一成单篇文章对象，其余字段原样保留。
 */
export function normalizeDraftUpdateArticles(articles: unknown): DraftUpdateArticle {
  if (Array.isArray(articles)) {
    return articles[0] as DraftUpdateArticle
  }

  if (articles && typeof articles === 'object' && Array.isArray((articles as { articles?: unknown }).articles)) {
    return (articles as { articles: DraftUpdateArticle[] }).articles[0]
  }

  return articles as DraftUpdateArticle
}
