import { z } from 'zod'

const trimmedRequiredString = (message: string) => z.string().trim().min(1, message)

export const exchangeOAuthCodeBodySchema = z.object({
  code: trimmedRequiredString('code 不能为空'),
})

export const githubAuthorizeQuerySchema = z.object({
  redirect: z.string().optional(),
})

export const githubCallbackQuerySchema = z.object({
  code: trimmedRequiredString('缺少 github OAuth 回调参数 code/state'),
  state: trimmedRequiredString('缺少 github OAuth 回调参数 code/state'),
  error: z.string().optional(),
})

export const exchangeOAuthCodeResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  accessExpiresAt: z.string(),
  refreshExpiresAt: z.string(),
  user: z.object({
    id: z.string(),
    username: z.string(),
    nickname: z.string().nullable(),
    email: z.string().nullable(),
    role: z.string(),
    avatarUrl: z.string().nullable(),
    website: z.string().nullable(),
    status: z.number(),
  }),
})
