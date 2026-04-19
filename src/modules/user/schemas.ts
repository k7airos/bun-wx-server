import { z } from 'zod'

const trimmedRequiredString = (message: string) => z.string().trim().min(1, message)
const trimmedOptionalString = (message: string) => z.string().trim().min(1, message).optional()
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

export const userDetailBodySchema = z.object({
  id: trimmedRequiredString('id 不能为空'),
})

export const userIdParamsSchema = z.object({
  id: trimmedRequiredString('id is required'),
})

export const updateUserBodySchema = z.object({
  email: trimmedOptionalString('email 不能为空'),
  nickname: trimmedOptionalString('nickname 不能为空'),
  username: trimmedOptionalString('username 不能为空'),
  password: trimmedOptionalString('password 不能为空'),
  website: trimmedOptionalString('website 不能为空'),
  avatar_url: trimmedOptionalString('avatar_url 不能为空'),
})

export const currentUserResponseSchema = serializedUserSchema
export const userCountResponseSchema = z.number()
export const userDetailResponseSchema = serializedUserSchema.nullable()
export const updateUserResponseSchema = serializedUserSchema
