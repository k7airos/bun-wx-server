import { API_CODES } from '../lib/api-codes'
import { authenticateRequest, resolveBearerToken } from '../lib/auth'
import { jsonError } from '../lib/response'
import { logError, logInfo } from '../lib/logger'
import { randomId } from '../lib/utils'
import { authRoutes } from './auth'
import { systemRoutes } from './system'
import { tokenRoutes } from './token'
import { uploadRoutes } from './upload'
import { userRoutes } from './user'
import { wechatRoutes } from './wechat'
import { buildRouteContext, matchRoutePath, type AppRouteDefinition } from './utils'

const routes: AppRouteDefinition[] = [
  ...systemRoutes,
  ...authRoutes,
  ...userRoutes,
  ...tokenRoutes,
  ...uploadRoutes,
  ...wechatRoutes,
]

function routeNotFound() {
  return Response.json({
    code: API_CODES.RESOURCE_NOT_FOUND,
    message: '接口不存在',
    data: null,
    timestamp: Date.now(),
  }, { status: 404 })
}

function getRouteAuthContext(request: Request, pathname: string, authMode: AppRouteDefinition['auth']) {
  const token = resolveBearerToken(request)
  if (!token) {
    if (authMode === 'required') {
      return Response.json({
        code: API_CODES.NO_TOKEN,
        message: '请先登录',
        data: null,
        timestamp: Date.now(),
      }, { status: 401 })
    }
    return null
  }

  return authenticateRequest(request, pathname)
}

function enforceLegacyApiAuth(request: Request, pathname: string) {
  if (!pathname.startsWith('/api/v1/')) {
    return null
  }

  const token = request.headers.get('authorization')
  if (!token && request.method !== 'GET') {
    return Response.json({
      code: API_CODES.NO_TOKEN,
      message: '请先登录',
      data: null,
      timestamp: Date.now(),
    }, { status: 401 })
  }

  if (token) {
    authenticateRequest(request, pathname)
  }

  return null
}

export function createAppFetch() {
  return async (request: Request) => {
    const requestId = randomId(8)
    const startedAt = Date.now()
    const method = request.method
    try {
      const url = new URL(request.url)
      const pathname = url.pathname
      logInfo('request.started', {
        requestId,
        method,
        pathname,
      })

      for (const route of routes) {
        if (route.method !== request.method) {
          continue
        }

        const params = matchRoutePath(route.matchPath, pathname)
        if (!params) {
          continue
        }

        const authResult = getRouteAuthContext(request, pathname, route.auth || 'none')
        if (authResult instanceof Response) {
          return authResult
        }

        const context = await buildRouteContext({
          route,
          request,
          requestId,
          url,
          pathname,
          params,
          auth: authResult,
        })

        const response = await route.handler(context)
        logInfo('request.completed', {
          requestId,
          method,
          pathname,
          status: response.status,
          durationMs: Date.now() - startedAt,
          userId: context.auth?.userId || null,
          tokenType: context.auth?.tokenType || null,
        })
        return response
      }

      const authResponse = enforceLegacyApiAuth(request, pathname)
      if (authResponse) {
        logInfo('request.completed', {
          requestId,
          method,
          pathname,
          status: authResponse.status,
          durationMs: Date.now() - startedAt,
          userId: null,
          tokenType: null,
        })
        return authResponse
      }

      const response = routeNotFound()
      logInfo('request.completed', {
        requestId,
        method,
        pathname,
        status: response.status,
        durationMs: Date.now() - startedAt,
        userId: null,
        tokenType: null,
      })
      return response
    }
    catch (error) {
      const pathname = (() => {
        try {
          return new URL(request.url).pathname
        }
        catch {
          return 'unknown'
        }
      })()
      logError('request.failed', {
        requestId,
        method,
        pathname,
        durationMs: Date.now() - startedAt,
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message : String(error),
      })
      return jsonError(error, requestId)
    }
  }
}
