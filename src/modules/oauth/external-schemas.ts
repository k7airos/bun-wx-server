import { z } from 'zod'

const nullableString = z.string().nullable().optional()

export const githubAccessTokenResponseSchema = z.object({
  access_token: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
}).refine(
  data => typeof data.access_token === 'string' || typeof data.error === 'string',
  { message: 'GitHub access token 响应缺少必要字段' },
)

export const githubUserResponseSchema = z.object({
  id: z.number(),
  login: z.string(),
  avatar_url: nullableString,
  email: nullableString,
})

export const githubEmailResponseSchema = z.array(z.object({
  email: z.string(),
  primary: z.boolean().optional(),
  verified: z.boolean().optional(),
}))
