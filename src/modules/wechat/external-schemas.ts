import { z } from 'zod'

export const wechatAccessTokenResponseSchema = z.object({
  access_token: z.string().optional(),
  expires_in: z.number().optional(),
  errcode: z.number().optional(),
  errmsg: z.string().optional(),
}).refine(
  data => (typeof data.access_token === 'string' && typeof data.expires_in === 'number') || typeof data.errcode === 'number',
  { message: '微信 Token 响应缺少必要字段' },
)

export const wechatMaterialResponseSchema = z.object({
  media_id: z.string().optional(),
  url: z.string().optional(),
  errcode: z.number().optional(),
  errmsg: z.string().optional(),
}).refine(
  data => typeof data.media_id === 'string' || typeof data.errcode === 'number',
  { message: '微信素材响应缺少必要字段' },
)

export const wechatDraftResponseSchema = z.object({
  media_id: z.string().optional(),
  errcode: z.number().optional(),
  errmsg: z.string().optional(),
}).refine(
  data => typeof data.media_id === 'string' || typeof data.errcode === 'number',
  { message: '微信草稿响应缺少必要字段' },
)

export const wechatDraftUpdateResponseSchema = z.looseObject({
  errcode: z.number().optional(),
  errmsg: z.string().optional(),
  media_id: z.string().optional(),
}).refine(
  data => typeof data.errcode === 'number' || typeof data.media_id === 'string',
  { message: '微信草稿更新响应缺少必要字段' },
)

export const wechatDraftGetResponseSchema = z.looseObject({
  errcode: z.number().optional(),
  errmsg: z.string().optional(),
  news_item: z.array(z.looseObject({})).optional(),
}).refine(
  data => typeof data.errcode === 'number' || Array.isArray(data.news_item),
  { message: '微信草稿读取响应缺少必要字段' },
)

export const wechatDraftDeleteResponseSchema = z.looseObject({
  errcode: z.number().optional(),
  errmsg: z.string().optional(),
}).refine(
  data => typeof data.errcode === 'number',
  { message: '微信草稿删除响应缺少必要字段' },
)

export const wechatDraftBatchGetResponseSchema = z.looseObject({
  errcode: z.number().optional(),
  errmsg: z.string().optional(),
  total_count: z.number().optional(),
  item_count: z.number().optional(),
  item: z.array(z.looseObject({})).optional(),
}).refine(
  data => typeof data.errcode === 'number' || typeof data.total_count === 'number' || Array.isArray(data.item),
  { message: '微信草稿列表响应缺少必要字段' },
)
