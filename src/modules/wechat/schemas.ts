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

/**
 * 草稿更新按微信协议只替换一篇文章，调用方可能直接传单篇文章对象，
 * 也可能传 `{ articles: [...] }` 包装结构，这里都接受并归一化成单篇对象。
 * 使用 looseObject 保留 pic_crop 等微信自有字段，避免被 zod 裁掉。
 */
export const wxDraftUpdateArticleSchema = z.looseObject({
  title: trimmedRequiredString('title 不能为空'),
  content: trimmedRequiredString('content 不能为空'),
})

export type WxDraftUpdateArticle = z.output<typeof wxDraftUpdateArticleSchema>

export const updateWxDraftBodySchema = z.object({
  access_token: trimmedRequiredString('access_token 不能为空'),
  media_id: trimmedRequiredString('media_id 不能为空'),
  index: z.number().int().min(0, 'index 必须是非负整数'),
  articles: z.union([
    wxDraftUpdateArticleSchema,
    z.array(wxDraftUpdateArticleSchema).min(1, 'articles 参数必须是非空数组'),
    z.object({
      articles: z.array(wxDraftUpdateArticleSchema).min(1, 'articles 参数必须是非空数组'),
    }),
  ]),
})

export const getWxDraftBodySchema = z.object({
  access_token: trimmedRequiredString('access_token 不能为空'),
  media_id: trimmedRequiredString('media_id 不能为空'),
})

export const deleteWxDraftBodySchema = z.object({
  access_token: trimmedRequiredString('access_token 不能为空'),
  media_id: trimmedRequiredString('media_id 不能为空'),
})

export const batchGetWxDraftBodySchema = z.object({
  access_token: trimmedRequiredString('access_token 不能为空'),
  offset: z.number().int().min(0, 'offset 必须是非负整数'),
  count: z.number().int().min(1, 'count 必须是正整数').max(20, 'count 不能超过 20'),
  no_content: z.union([z.boolean(), z.number().int().min(0).max(1)]).optional(),
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

export const wxDraftUpdateResponseSchema = z.looseObject({
  errcode: z.number().optional(),
  errmsg: z.string().optional(),
  media_id: z.string().optional(),
})

export const wxDraftGetResponseSchema = z.looseObject({
  errcode: z.number().optional(),
  errmsg: z.string().optional(),
  news_item: z.array(z.looseObject({})).optional(),
})

export const wxDraftDeleteResponseSchema = z.looseObject({
  errcode: z.number().optional(),
  errmsg: z.string().optional(),
})

export const wxDraftBatchGetResponseSchema = z.looseObject({
  errcode: z.number().optional(),
  errmsg: z.string().optional(),
  total_count: z.number().optional(),
  item_count: z.number().optional(),
  item: z.array(z.looseObject({})).optional(),
})
