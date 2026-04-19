import { z } from 'zod'

const trimmedRequiredString = (message: string) => z.string().trim().min(1, message)
const trimmedOptionalString = (message: string) => z.string().trim().min(1, message).optional()

export const issueCosCredentialBodySchema = z.object({
  filename: trimmedRequiredString('filename 不能为空'),
  folder: z.object({
    name: trimmedOptionalString('folder.name 不能为空'),
  }).optional(),
})

export const issueCosCredentialResponseSchema = z.object({
  TmpSecretId: z.string().optional(),
  TmpSecretKey: z.string().optional(),
  SessionToken: z.string().optional(),
  StartTime: z.number(),
  ExpiredTime: z.number().optional(),
  Bucket: z.string(),
  Region: z.string(),
  Key: z.string(),
})
