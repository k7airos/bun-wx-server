import { badRequest } from '../lib/errors'
import { jsonSuccess } from '../lib/response'
import { parseWithSchema } from '../lib/validation'
import { assertAllowedSource } from '../lib/wechat'
import { requireSuperAdmin } from '../lib/auth'
import { recordAuditLog } from '../modules/audit'
import type { AuthContext } from '../modules/auth'
import type { ZodType } from 'zod'

export async function readJson<T>(request: Request, schema?: ZodType<T>, message = '请求参数不合法') {
  const contentType = request.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    throw badRequest('请求体必须为 application/json')
  }

  const body = await request.json()
  return schema ? parseWithSchema(schema, body, message) : body as T
}

export async function readFormData<T>(request: Request, schema?: ZodType<T>, message = '请求参数不合法') {
  const form = await request.formData()
  const body = Object.fromEntries(form.entries())
  return schema ? parseWithSchema(schema, body, message) : body as T
}

export type RouteParams = Record<string, string>
export type RouteQuery = Record<string, string>

export type AppRouteContext = {
  request: Request
  requestId: string
  url: URL
  pathname: string
  params: RouteParams
  query: RouteQuery
  auth: AuthContext | null
  body?: unknown
  form?: unknown
  json: (data: unknown, init?: ResponseInit) => Response
  audit: (input: {
    action: string
    status?: 'success' | 'failure'
    targetType?: string | null
    targetId?: string | null
    metadata?: unknown
  }) => void
}

export type AppRouteDefinition = {
  method: string
  matchPath: string
  auth?: 'required' | 'optional' | 'none'
  role?: 'superAdmin'
  sourceCheck?: boolean
  paramsSchema?: ZodType
  querySchema?: ZodType
  jsonSchema?: ZodType
  formSchema?: ZodType
  responseSchema?: ZodType
  handler: (context: AppRouteContext) => Promise<Response>
}

export function matchRoutePath(matchPath: string, pathname: string): RouteParams | null {
  const routeSegments = matchPath.split('/').filter(Boolean)
  const pathSegments = pathname.split('/').filter(Boolean)

  if (routeSegments.length !== pathSegments.length) {
    return null
  }

  const params: RouteParams = {}
  for (let index = 0; index < routeSegments.length; index += 1) {
    const routeSegment = routeSegments[index]
    const pathSegment = pathSegments[index]
    if (routeSegment.startsWith(':')) {
      params[routeSegment.slice(1)] = pathSegment
      continue
    }
    if (routeSegment !== pathSegment) {
      return null
    }
  }

  return params
}

export async function buildRouteContext(input: {
  route: AppRouteDefinition
  request: Request
  requestId: string
  url: URL
  pathname: string
  params: RouteParams
  auth: AuthContext | null
}) {
  const query = Object.fromEntries(input.url.searchParams.entries())
  const context: AppRouteContext = {
    request: input.request,
    requestId: input.requestId,
    url: input.url,
    pathname: input.pathname,
    params: input.params,
    query,
    auth: input.auth,
    json: (data, init = {}) => {
      const safeData = input.route.responseSchema
        ? parseWithSchema(input.route.responseSchema, data, '响应数据不合法')
        : data
      return jsonSuccess(safeData, init, input.requestId)
    },
    audit: (auditInput) => {
      recordAuditLog({
        requestId: input.requestId,
        action: auditInput.action,
        actorUserId: input.auth?.userId || null,
        actorRole: input.auth?.role || null,
        status: auditInput.status || 'success',
        targetType: auditInput.targetType || null,
        targetId: auditInput.targetId || null,
        metadata: auditInput.metadata,
      })
    },
  }

  if (input.route.paramsSchema) {
    context.params = parseWithSchema(input.route.paramsSchema, input.params, '路径参数不合法') as RouteParams
  }

  if (input.route.querySchema) {
    context.query = parseWithSchema(input.route.querySchema, query, '查询参数不合法') as RouteQuery
  }

  if (input.route.role === 'superAdmin') {
    if (!input.auth) {
      throw badRequest('缺少鉴权上下文')
    }
    requireSuperAdmin(input.auth.role)
  }

  if (input.route.sourceCheck) {
    assertAllowedSource(input.request)
  }

  if (input.route.jsonSchema) {
    context.body = await readJson(input.request, input.route.jsonSchema)
  }

  if (input.route.formSchema) {
    context.form = await readFormData(input.request, input.route.formSchema)
  }

  return context
}
