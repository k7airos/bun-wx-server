import { badRequest } from './errors'
import { ZodError, type ZodType } from 'zod'

function formatZodPath(path: Array<string | number>) {
  if (!path.length) {
    return 'root'
  }

  return path.reduce((result, segment) => {
    if (typeof segment === 'number') {
      return `${result}[${segment}]`
    }
    return result ? `${result}.${segment}` : segment
  }, '')
}

export function formatZodError(error: ZodError) {
  return error.issues.map(issue => ({
    path: formatZodPath(issue.path),
    message: issue.message,
  }))
}

export function parseWithSchema<T>(schema: ZodType<T>, input: unknown, message = '请求参数不合法') {
  const result = schema.safeParse(input)
  if (result.success) {
    return result.data
  }

  throw badRequest(message, {
    issues: formatZodError(result.error),
  })
}
