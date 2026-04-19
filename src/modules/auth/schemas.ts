import { z } from 'zod'

const trimmedRequiredString = (message: string) => z.string().trim().min(1, message)
const serializedUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  nickname: z.string().nullable(),
  email: z.string().nullable(),
  role: z.string(),
  avatarUrl: z.string().nullable(),
  website: z.string().nullable(),
  status: z.number(),
})

export const loginBodySchema = z.object({
  username: trimmedRequiredString('username 不能为空'),
  password: trimmedRequiredString('password 不能为空'),
})

export const refreshTokenBodySchema = z.object({
  refreshToken: trimmedRequiredString('refreshToken 不能为空'),
})

export const loginResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  accessExpiresAt: z.string(),
  refreshExpiresAt: z.string(),
  user: serializedUserSchema,
})

export const refreshTokenResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.string(),
})
