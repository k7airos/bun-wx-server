import { z } from 'zod'

export const cosFederationTokenResponseSchema = z.object({
  Response: z.record(z.string(), z.unknown()).optional(),
}).refine(
  data => data.Response !== undefined,
  { message: 'COS STS 响应缺少 Response 字段' },
)
