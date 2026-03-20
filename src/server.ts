import { config, assertRuntimeConfig, getConfigWarnings } from './config'
import { API_CODES } from './lib/api-codes'
import { badRequest } from './lib/errors'
import { jsonError, jsonSuccess } from './lib/response'
import {
  authenticateRequest,
  generatePAT,
  getCurrentUser,
  loginUser,
  PAT_SCOPES,
  refreshAccessToken,
  requireAuth,
  requireSuperAdmin,
} from './lib/auth'
import { issueCosCredential } from './lib/cos'
import { createWxDraft, fetchWxAccessToken, uploadWxMaterial, assertAllowedSource } from './lib/wechat'

async function readJson(request: Request) {
  const contentType = request.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    throw badRequest('请求体必须为 application/json')
  }
  return await request.json()
}

function routeNotFound() {
  return Response.json({
    code: API_CODES.RESOURCE_NOT_FOUND,
    message: '接口不存在',
    data: null,
    timestamp: Date.now(),
  }, { status: 404 })
}

function withHandler(handler: (request: Request, url: URL) => Promise<Response>) {
  return async (request: Request) => {
    try {
      const url = new URL(request.url)
      return await handler(request, url)
    }
    catch (error) {
      return jsonError(error)
    }
  }
}

export function createAppFetch() {
  return withHandler(async (request, url) => {
    const pathname = url.pathname

    if (request.method === 'GET' && pathname === '/health') {
      return jsonSuccess({ status: 'ok' })
    }

    if (request.method === 'GET' && pathname === '/ready') {
      return jsonSuccess({
        status: 'ok',
        databasePath: config.databasePath,
      })
    }

    if (request.method === 'POST' && pathname === '/api/v1/user/login') {
      const body = await readJson(request) as { username?: string, password?: string }
      const data = await loginUser(body.username || '', body.password || '')
      return jsonSuccess(data)
    }

    if (request.method === 'POST' && pathname === '/api/v1/auth/refresh') {
      const body = await readJson(request) as { refreshToken?: string }
      const data = refreshAccessToken(body.refreshToken || '')
      return jsonSuccess({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt: data.accessExpiresAt,
      })
    }

    if (request.method === 'GET' && pathname === '/api/v1/token/scopes') {
      return jsonSuccess(Object.entries(PAT_SCOPES).map(([key, value]) => ({
        key,
        label: value.label,
        paths: value.paths,
      })))
    }

    if (request.method === 'GET' && pathname === '/api/v1/user/me') {
      const auth = requireAuth(request, pathname)
      return jsonSuccess({ user: getCurrentUser(auth.userId) })
    }

    if (request.method === 'POST' && pathname === '/api/v1/token/generate') {
      const auth = requireAuth(request, pathname)
      const body = await readJson(request) as {
        note?: string
        scopes?: Array<keyof typeof PAT_SCOPES>
        expiresInDays?: number
      }
      const data = generatePAT(
        auth.userId,
        body.note || '',
        body.scopes || ['all'],
        typeof body.expiresInDays === 'number' ? body.expiresInDays : 365,
      )
      return jsonSuccess(data)
    }

    if (request.method === 'POST' && pathname === '/api/v1/upload/cos') {
      const auth = requireAuth(request, pathname)
      requireSuperAdmin(auth.role)
      const body = await readJson(request) as {
        filename?: string
        folder?: { name?: string }
      }
      if (!body.filename) {
        throw badRequest('filename 不能为空')
      }
      const data = await issueCosCredential({
        userId: auth.userId,
        filename: body.filename,
        folder: body.folder?.name ? { name: body.folder.name } : undefined,
      })
      return jsonSuccess(data)
    }

    if (request.method === 'POST' && pathname === '/api/v1/wx/cgi-bin/token') {
      requireAuth(request, pathname)
      assertAllowedSource(request)
      const body = await readJson(request) as { appId?: string, appSecret?: string }
      const data = await fetchWxAccessToken(body.appId || '', body.appSecret || '')
      return jsonSuccess(data)
    }

    if (request.method === 'POST' && pathname === '/api/v1/wx/cgi-bin/material/add_material') {
      requireAuth(request, pathname)
      assertAllowedSource(request)
      const form = await request.formData()
      const accessToken = String(form.get('access_token') || '')
      const type = String(form.get('type') || '')
      const media = form.get('media')
      if (!(media instanceof File)) {
        throw badRequest('缺少 media 文件')
      }
      const data = await uploadWxMaterial(accessToken, type, media)
      return jsonSuccess(data)
    }

    if (request.method === 'POST' && pathname === '/api/v1/wx/cgi-bin/draft/add') {
      requireAuth(request, pathname)
      assertAllowedSource(request)
      const body = await readJson(request) as {
        access_token?: string
        articles?: any[]
      }
      const data = await createWxDraft(body.access_token || '', body.articles || [])
      return jsonSuccess(data)
    }

    if (pathname.startsWith('/api/v1/')) {
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
    }

    return routeNotFound()
  })
}

export function startServer() {
  assertRuntimeConfig('serve')

  const warnings = getConfigWarnings('serve')
  warnings.forEach((warning) => {
    console.warn(`[blog-wx-bun-service] warning: ${warning}`)
  })

  const server = Bun.serve({
    port: config.port,
    idleTimeout: 30,
    fetch: createAppFetch(),
  })

  console.log(`[blog-wx-bun-service] listening on http://localhost:${server.port}`)
  return server
}
