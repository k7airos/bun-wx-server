import { z } from 'zod'

const trimmedRequiredString = (message: string) => z.string().trim().min(1, message)
const trimmedOptionalString = (message: string) => z.string().trim().min(1, message).optional()

export const fetchWxTokenBodySchema = z.object({
  appId: trimmedRequiredString('appId 不能为空'),
  appSecret: trimmedRequiredString('appSecret 不能为空'),
})

const wxDraftNewsArticleSchema = z.object({
  article_type: z.literal('news'),
  title: trimmedRequiredString('title 不能为空'),
  author: trimmedOptionalString('author 不能为空'),
  digest: trimmedOptionalString('digest 不能为空'),
  content: trimmedRequiredString('content 不能为空'),
  thumb_media_id: trimmedRequiredString('thumb_media_id 在 article_type=news 时必填'),
  need_open_comment: z.number().int().optional(),
})

const wxDraftNewsPicArticleSchema = z.object({
  article_type: z.literal('newspic'),
  title: trimmedRequiredString('title 不能为空'),
  author: trimmedOptionalString('author 不能为空'),
  digest: trimmedOptionalString('digest 不能为空'),
  content: trimmedRequiredString('content 不能为空'),
  need_open_comment: z.number().int().optional(),
  image_info: z.object({
    image_list: z.array(z.object({
      image_media_id: trimmedRequiredString('image_media_id 不能为空'),
    })).min(1, 'image_info.image_list 在 article_type=newspic 时必填'),
  }),
})

export const wxDraftArticleSchema = z.discriminatedUnion('article_type', [
  wxDraftNewsArticleSchema,
  wxDraftNewsPicArticleSchema,
])

export type WxDraftArticle = z.output<typeof wxDraftArticleSchema>

export const createWxDraftBodySchema = z.object({
  access_token: trimmedRequiredString('access_token 不能为空'),
  articles: z.array(wxDraftArticleSchema).min(1, 'articles 参数必须是非空数组'),
})

export const uploadWxMaterialFormSchema = z.object({
  access_token: trimmedRequiredString('access_token 不能为空'),
  type: z.literal('image', {
    error: () => ({ message: '仅支持 type=image' }),
  }),
  media: z.instanceof(File, {
    error: () => ({ message: '缺少 media 文件' }),
  }),
})

export const wxTokenResponseSchema = z.object({
  accessToken: z.string().optional(),
  expiresIn: z.number().optional(),
})

export const wxMaterialResponseSchema = z.object({
  media_id: z.string().optional(),
  url: z.string().optional(),
})

export const wxDraftResponseSchema = z.object({
  media_id: z.string().optional(),
})
