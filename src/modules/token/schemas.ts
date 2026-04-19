import { z } from 'zod'

const trimmedRequiredString = (message: string) => z.string().trim().min(1, message)

export const generatePatBodySchema = z.object({
  note: trimmedRequiredString('note 不能为空'),
  scopes: z.array(z.string().trim().min(1, 'scopes 不能为空')).min(1, 'scopes 至少需要一个值').optional(),
  expiresInDays: z.number().int().min(0, 'expiresInDays 不能小于 0').optional(),
})

export const tokenIdParamsSchema = z.object({
  id: trimmedRequiredString('参数错误'),
})

export const tokenScopesResponseSchema = z.object({
  scopes: z.array(z.object({
    key: z.string(),
    label: z.string(),
    paths: z.array(z.string()),
  })),
})

export const generatePatResponseSchema = z.object({
  token: z.string(),
  note: z.string(),
  expiresInDays: z.number(),
  scopes: z.array(z.string()),
  message: z.string(),
})

export const listPatResponseSchema = z.array(z.object({
  id: z.string(),
  note: z.string(),
  scopes: z.array(z.string()),
  createdAt: z.string(),
  expiresAt: z.string(),
}))

export const revokePatResponseSchema = z.object({
  success: z.boolean(),
})
