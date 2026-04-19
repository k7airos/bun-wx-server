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
