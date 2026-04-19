import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync } from '../src/lib/bun-fs'
import './test-env'

const serverModule = await import('../src/server')
const authModule = await import('../src/lib/auth')
const dbModule = await import('../src/db')

const fetchHandler = serverModule.createAppFetch()
const originalFetch = globalThis.fetch
const originalConsoleInfo = console.info
const originalConsoleError = console.error

type FetchMock = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

function setFetchMock(impl: FetchMock) {
  globalThis.fetch = impl as typeof fetch
}

function restoreFetch() {
  globalThis.fetch = originalFetch
}

function withConsoleCapture<T>(run: (logs: { info: string[], error: string[] }) => Promise<T>) {
  const logs = { info: [] as string[], error: [] as string[] }
  console.info = ((...args: unknown[]) => {
    logs.info.push(args.map(arg => String(arg)).join(' '))
  }) as typeof console.info
  console.error = ((...args: unknown[]) => {
    logs.error.push(args.map(arg => String(arg)).join(' '))
  }) as typeof console.error

  return run(logs).finally(() => {
    console.info = originalConsoleInfo
    console.error = originalConsoleError
  })
}

function makeRequest(pathname: string, init: RequestInit = {}) {
  return fetchHandler(new Request(`http://localhost${pathname}`, init))
}

function makeJsonRequest(pathname: string, body: unknown, init: RequestInit = {}) {
  return makeRequest(pathname, {
    method: init.method || 'POST',
    headers: {
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
    body: JSON.stringify(body),
  })
}

function makeAuthedJsonRequest(pathname: string, token: string, body: unknown, init: RequestInit = {}) {
  return makeJsonRequest(pathname, body, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  })
}

function makeAuthedRequest(pathname: string, token: string, init: RequestInit = {}) {
  return makeRequest(pathname, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  })
}

describe('service compatibility with Nuxt api contracts', () => {
  let adminUserId = ''
  let accessToken = ''
  let refreshToken = ''
  let generatedPat = ''

  beforeAll(async () => {
    dbModule.runMigrations()

    const loginBeforeInit = await makeJsonRequest('/api/v1/user/login', {
      username: 'admin',
      password: 'secret123',
    })
    const loginBeforeInitPayload = await loginBeforeInit.json() as { message: string }

    expect(loginBeforeInit.status).toBe(403)
    expect(loginBeforeInitPayload.message).toContain('init-admin')

    const initialAdmin = await authModule.createInitialAdmin('admin', 'secret123', 'Administrator')
    adminUserId = initialAdmin.id
  })

  test('login and refresh follow the expected auth flow', async () => {
    const loginResponse = await makeJsonRequest('/api/v1/user/login', {
      username: 'admin',
      password: 'secret123',
    })
    const loginPayload = await loginResponse.json() as {
      code: number
      data: {
        accessToken: string
        refreshToken: string
        user: { id: string, role: string, username: string }
      }
    }

    expect(loginResponse.status).toBe(200)
    expect(loginPayload.code).toBe(0)
    expect(loginPayload.data.user.id).toBe(adminUserId)
    expect(loginPayload.data.user.role).toBe('superAdmin')
    expect(loginPayload.data.accessToken.length).toBeGreaterThan(20)
    expect(loginPayload.data.refreshToken.length).toBeGreaterThan(20)

    accessToken = loginPayload.data.accessToken
    refreshToken = loginPayload.data.refreshToken

    const refreshResponse = await makeJsonRequest('/api/v1/auth/refresh', {
      refreshToken,
    })
    const refreshPayload = await refreshResponse.json() as {
      code: number
      data: {
        accessToken: string
        refreshToken: string
        expiresAt: string
      }
    }

    expect(refreshResponse.status).toBe(200)
    expect(refreshPayload.code).toBe(0)
    expect(refreshPayload.data.accessToken.length).toBeGreaterThan(20)
    expect(refreshPayload.data.refreshToken).not.toBe(refreshToken)

    refreshToken = refreshPayload.data.refreshToken
  })

  test('zod-backed auth validation returns structured issues', async () => {
    const loginResponse = await makeJsonRequest('/api/v1/user/login', {
      username: '   ',
      password: 'secret123',
    })
    const loginPayload = await loginResponse.json() as {
      code: number
      message: string
      data: {
        issues: Array<{ path: string, message: string }>
      }
    }

    expect(loginResponse.status).toBe(400)
    expect(loginPayload.code).toBe(3001)
    expect(loginPayload.message).toBe('请求参数不合法')
    expect(loginPayload.data.issues.some(issue => issue.path === 'username')).toBe(true)

    const refreshResponse = await makeJsonRequest('/api/v1/auth/refresh', {
      refreshToken: '',
    })
    const refreshPayload = await refreshResponse.json() as {
      code: number
      data: {
        issues: Array<{ path: string, message: string }>
      }
    }

    expect(refreshResponse.status).toBe(400)
    expect(refreshPayload.code).toBe(3001)
    expect(refreshPayload.data.issues.some(issue => issue.path === 'refreshToken')).toBe(true)
  })

  test('user endpoints match the Nuxt-side urls and response shapes', async () => {
    const meResponse = await makeAuthedRequest('/api/v1/user/me', accessToken)
    const mePayload = await meResponse.json() as {
      code: number
      data: {
        id: string
        username: string
        nickname: string | null
        email: string | null
        avatarUrl: string | null
        role: string
        status: number
      }
    }

    expect(meResponse.status).toBe(200)
    expect(mePayload.code).toBe(0)
    expect(mePayload.data.id).toBe(adminUserId)
    expect(mePayload.data.username).toBe('admin')

    const countResponse = await makeRequest('/api/v1/user/count', { method: 'GET' })
    const countPayload = await countResponse.json() as { code: number, data: number }
    expect(countResponse.status).toBe(200)
    expect(countPayload.code).toBe(0)
    expect(countPayload.data).toBe(1)

    const detailResponse = await makeAuthedJsonRequest('/api/v1/user/detail', accessToken, {
      id: adminUserId,
    })
    const detailPayload = await detailResponse.json() as {
      code: number
      data: { id: string, username: string }
    }
    expect(detailResponse.status).toBe(200)
    expect(detailPayload.code).toBe(0)
    expect(detailPayload.data.id).toBe(adminUserId)

    const updateResponse = await makeAuthedJsonRequest(`/api/v1/user/${adminUserId}`, accessToken, {
      nickname: 'Updated Admin',
      avatar_url: 'https://example.com/avatar.png',
      website: 'https://example.com',
      email: 'admin@example.com',
    }, { method: 'PUT' })
    const updatePayload = await updateResponse.json() as {
      code: number
      data: {
        nickname: string
        avatarUrl: string
        website: string
        email: string
      }
    }

    expect(updateResponse.status).toBe(200)
    expect(updatePayload.code).toBe(0)
    expect(updatePayload.data.nickname).toBe('Updated Admin')
    expect(updatePayload.data.avatarUrl).toBe('https://example.com/avatar.png')
    expect(updatePayload.data.website).toBe('https://example.com')
    expect(updatePayload.data.email).toBe('admin@example.com')
  })

  test('pat routes expose Nuxt-compatible fields and enforce scope checks', async () => {
    const scopesResponse = await makeRequest('/api/v1/token/scopes', { method: 'GET' })
    const scopesPayload = await scopesResponse.json() as {
      code: number
      data: {
        scopes: Array<{ key: string, label: string, paths: string[] }>
      }
    }

    expect(scopesResponse.status).toBe(200)
    expect(scopesPayload.code).toBe(0)
    expect(scopesPayload.data.scopes.some(item => item.key === 'wx')).toBe(true)
    expect(scopesPayload.data.scopes.some(item => item.key === 'upload')).toBe(true)

    const generateResponse = await makeAuthedJsonRequest('/api/v1/token/generate', accessToken, {
      note: 'wx bot',
      expiresInDays: 7,
      scopes: ['wx'],
    })
    const generatePayload = await generateResponse.json() as {
      code: number
      data: {
        token: string
        note: string
        expiresInDays: number
        scopes: string[]
        message: string
      }
    }

    expect(generateResponse.status).toBe(200)
    expect(generatePayload.code).toBe(0)
    expect(generatePayload.data.note).toBe('wx bot')
    expect(generatePayload.data.expiresInDays).toBe(7)
    expect(generatePayload.data.scopes).toEqual(['wx'])
    generatedPat = generatePayload.data.token

    const listResponse = await makeAuthedRequest('/api/v1/token/list', accessToken, { method: 'GET' })
    const listPayload = await listResponse.json() as {
      code: number
      data: Array<{ id: string, note: string, scopes: string[], expiresAt: string }>
    }

    expect(listResponse.status).toBe(200)
    expect(listPayload.code).toBe(0)
    expect(listPayload.data.length).toBe(1)
    expect(listPayload.data[0].note).toBe('wx bot')
    expect(listPayload.data[0].scopes).toEqual(['wx'])

    setFetchMock(async () => Response.json({ access_token: 'wx-token', expires_in: 7200 }))

    const wxWithPatResponse = await makeJsonRequest('/api/v1/wx/cgi-bin/token', {
      appId: 'appid',
      appSecret: 'secret',
    }, {
      headers: {
        authorization: `Bearer ${generatedPat}`,
        'x-app-source': 'zotepad',
      },
    })
    const wxWithPatPayload = await wxWithPatResponse.json() as {
      code: number
      data: { accessToken: string, expiresIn: number }
    }
    expect(wxWithPatResponse.status).toBe(200)
    expect(wxWithPatPayload.data.accessToken).toBe('wx-token')

    restoreFetch()

    const uploadDeniedResponse = await makeJsonRequest('/api/v1/upload/cos', {
      filename: 'a.png',
    }, {
      headers: {
        authorization: `Bearer ${generatedPat}`,
      },
    })
    const uploadDeniedPayload = await uploadDeniedResponse.json() as { code: number, message: string }
    expect(uploadDeniedResponse.status).toBe(403)
    expect(uploadDeniedPayload.code).toBe(2001)

    const deleteResponse = await makeAuthedRequest(`/api/v1/token/${listPayload.data[0].id}`, accessToken, {
      method: 'DELETE',
    })
    const deletePayload = await deleteResponse.json() as { code: number, data: { success: boolean } }
    expect(deleteResponse.status).toBe(200)
    expect(deletePayload.data.success).toBe(true)

    const revokedPatResponse = await makeJsonRequest('/api/v1/wx/cgi-bin/token', {
      appId: 'appid',
      appSecret: 'secret',
    }, {
      headers: {
        authorization: `Bearer ${generatedPat}`,
        'x-app-source': 'zotepad',
      },
    })
    const revokedPatPayload = await revokedPatResponse.json() as { code: number, message: string }
    expect(revokedPatResponse.status).toBe(401)
    expect(revokedPatPayload.code).toBe(1002)
  })

  test('zod-backed PAT validation rejects malformed payloads', async () => {
    const response = await makeAuthedJsonRequest('/api/v1/token/generate', accessToken, {
      note: 'wx bot',
      expiresInDays: -1,
      scopes: [],
    })
    const payload = await response.json() as {
      code: number
      message: string
      data: {
        issues: Array<{ path: string, message: string }>
      }
    }

    expect(response.status).toBe(400)
    expect(payload.code).toBe(3001)
    expect(payload.message).toBe('请求参数不合法')
    expect(payload.data.issues.some(issue => issue.path === 'scopes')).toBe(true)
    expect(payload.data.issues.some(issue => issue.path === 'expiresInDays')).toBe(true)
  })

  test('zod-backed request validation covers update user, cos upload, wechat token and draft', async () => {
    const updateResponse = await makeAuthedJsonRequest(`/api/v1/user/${adminUserId}`, accessToken, {
      email: '   ',
    }, { method: 'PUT' })
    const updatePayload = await updateResponse.json() as {
      code: number
      data: {
        issues: Array<{ path: string, message: string }>
      }
    }
    expect(updateResponse.status).toBe(400)
    expect(updatePayload.data.issues.some(issue => issue.path === 'email')).toBe(true)

    const cosResponse = await makeAuthedJsonRequest('/api/v1/upload/cos', accessToken, {
      filename: '   ',
    })
    const cosPayload = await cosResponse.json() as {
      code: number
      data: {
        issues: Array<{ path: string, message: string }>
      }
    }
    expect(cosResponse.status).toBe(400)
    expect(cosPayload.data.issues.some(issue => issue.path === 'filename')).toBe(true)

    const wxTokenResponse = await makeAuthedJsonRequest('/api/v1/wx/cgi-bin/token', accessToken, {
      appId: 'appid',
      appSecret: '   ',
    }, {
      headers: {
        'x-app-source': 'zotepad',
      },
    })
    const wxTokenPayload = await wxTokenResponse.json() as {
      code: number
      data: {
        issues: Array<{ path: string, message: string }>
      }
    }
    expect(wxTokenResponse.status).toBe(400)
    expect(wxTokenPayload.data.issues.some(issue => issue.path === 'appSecret')).toBe(true)

    const wxDraftResponse = await makeAuthedJsonRequest('/api/v1/wx/cgi-bin/draft/add', accessToken, {
      access_token: 'wx-token-ok',
      articles: [
        {
          article_type: 'news',
          title: 'Hello',
          content: 'World',
        },
      ],
    }, {
      headers: {
        'x-app-source': 'zotepad',
      },
    })
    const wxDraftPayload = await wxDraftResponse.json() as {
      code: number
      data: {
        issues: Array<{ path: string, message: string }>
      }
    }
    expect(wxDraftResponse.status).toBe(400)
    expect(wxDraftPayload.data.issues.some(issue => issue.path === 'articles[0].thumb_media_id')).toBe(true)
  })

  test('github oauth follows standard authorize -> callback -> exchange flow', async () => {
    let tokenExchangeCalled = false
    let userProfileCalled = false
    let userEmailsCalled = false

    setFetchMock(async (input) => {
      const url = String(input)
      if (url === 'https://github.com/login/oauth/access_token') {
        tokenExchangeCalled = true
        return Response.json({ access_token: 'gh-access-token' })
      }
      if (url === 'https://api.github.com/user') {
        userProfileCalled = true
        return Response.json({
          id: 1001,
          login: 'octocat',
          avatar_url: 'https://avatars.githubusercontent.com/u/1001',
          email: null,
        })
      }
      if (url === 'https://api.github.com/user/emails') {
        userEmailsCalled = true
        return Response.json([
          { email: 'octocat@example.com', primary: true, verified: true },
        ])
      }
      return Response.json({})
    })

    const authorizeResponse = await makeRequest('/api/v1/auth/github?redirect=%2Fadmin', { method: 'GET' })
    expect(authorizeResponse.status).toBe(302)
    const authorizeLocation = authorizeResponse.headers.get('location') || ''
    expect(authorizeLocation.startsWith('https://github.com/login/oauth/authorize')).toBe(true)

    const authorizeUrl = new URL(authorizeLocation)
    const state = authorizeUrl.searchParams.get('state')
    expect(state).toBeTruthy()
    expect(authorizeUrl.searchParams.get('client_id')).toBe('github-client-id')

    const callbackResponse = await makeRequest(`/api/v1/auth/github/callback?code=github-code-1&state=${state}`, { method: 'GET' })
    expect(callbackResponse.status).toBe(302)
    const callbackLocation = callbackResponse.headers.get('location') || ''
    expect(callbackLocation.startsWith('http://frontend.local/auth/callback')).toBe(true)
    expect(tokenExchangeCalled).toBe(true)
    expect(userProfileCalled).toBe(true)
    expect(userEmailsCalled).toBe(true)

    const frontendCallbackUrl = new URL(callbackLocation)
    const exchangeCode = frontendCallbackUrl.searchParams.get('code') || ''
    expect(frontendCallbackUrl.searchParams.get('redirect')).toBe('/admin')
    expect(exchangeCode.length).toBeGreaterThan(10)

    const exchangeResponse = await makeJsonRequest('/api/v1/auth/exchange', { code: exchangeCode })
    const exchangePayload = await exchangeResponse.json() as {
      code: number
      data: {
        accessToken: string
        refreshToken: string
        user: { username: string, email: string | null }
      }
    }
    expect(exchangeResponse.status).toBe(200)
    expect(exchangePayload.code).toBe(0)
    expect(exchangePayload.data.user.username.startsWith('octocat')).toBe(true)
    expect(exchangePayload.data.user.email).toBe('octocat@example.com')

    const reusedExchangeResponse = await makeJsonRequest('/api/v1/auth/exchange', { code: exchangeCode })
    const reusedExchangePayload = await reusedExchangeResponse.json() as { code: number }
    expect(reusedExchangeResponse.status).toBe(400)
    expect(reusedExchangePayload.code).toBe(1004)

    restoreFetch()
  })

  test('wechat endpoints validate input and forward successful responses', async () => {
    setFetchMock(async (input) => {
      const url = String(input)

      if (url.includes('/cgi-bin/token')) {
        return Response.json({ access_token: 'wx-token-ok', expires_in: 7200 })
      }
      if (url.includes('/cgi-bin/material/add_material')) {
        return Response.json({ media_id: 'mid-1', url: 'https://wx.example/material.png' })
      }
      if (url.includes('/cgi-bin/draft/add')) {
        return Response.json({ media_id: 'draft-1' })
      }
      return Response.json({})
    })

    const wxTokenResponse = await makeAuthedJsonRequest('/api/v1/wx/cgi-bin/token', accessToken, {
      appId: 'appid',
      appSecret: 'secret',
    }, {
      headers: {
        'x-app-source': 'zotepad',
      },
    })
    const wxTokenPayload = await wxTokenResponse.json() as {
      code: number
      data: { accessToken: string, expiresIn: number }
    }

    expect(wxTokenResponse.status).toBe(200)
    expect(wxTokenPayload.code).toBe(0)
    expect(wxTokenPayload.data.accessToken).toBe('wx-token-ok')

    const badSourceResponse = await makeAuthedJsonRequest('/api/v1/wx/cgi-bin/token', accessToken, {
      appId: 'appid',
      appSecret: 'secret',
    }, {
      headers: {
        'x-app-source': 'unknown-client',
      },
    })
    const badSourcePayload = await badSourceResponse.json() as { code: number }
    expect(badSourceResponse.status).toBe(403)
    expect(badSourcePayload.code).toBe(2002)

    const materialForm = new FormData()
    materialForm.append('access_token', 'wx-token-ok')
    materialForm.append('type', 'image')
    materialForm.append('media', new File(['hello'], 'cover.png', { type: 'image/png' }))

    const materialResponse = await makeAuthedRequest('/api/v1/wx/cgi-bin/material/add_material', accessToken, {
      method: 'POST',
      headers: {
        'x-app-source': 'zotepad',
      },
      body: materialForm,
    })
    const materialPayload = await materialResponse.json() as {
      code: number
      data: { media_id: string, url: string }
    }

    expect(materialResponse.status).toBe(200)
    expect(materialPayload.data.media_id).toBe('mid-1')

    const draftResponse = await makeAuthedJsonRequest('/api/v1/wx/cgi-bin/draft/add', accessToken, {
      access_token: 'wx-token-ok',
      articles: [
        {
          article_type: 'news',
          title: 'Hello',
          content: 'World',
          thumb_media_id: 'thumb-1',
        },
      ],
    }, {
      headers: {
        'x-app-source': 'zotepad',
      },
    })
    const draftPayload = await draftResponse.json() as {
      code: number
      data: { media_id: string }
    }

    expect(draftResponse.status).toBe(200)
    expect(draftPayload.data.media_id).toBe('draft-1')

    restoreFetch()
  })

  test('zod-backed external response validation rejects malformed provider payloads', async () => {
    setFetchMock(async () => Response.json({ ok: true }))

    const wxTokenResponse = await makeAuthedJsonRequest('/api/v1/wx/cgi-bin/token', accessToken, {
      appId: 'appid',
      appSecret: 'secret',
    }, {
      headers: {
        'x-app-source': 'zotepad',
      },
    })
    const wxTokenPayload = await wxTokenResponse.json() as {
      code: number
      message: string
      data: {
        issues: Array<{ path: string, message: string }>
      }
    }
    expect(wxTokenResponse.status).toBe(400)
    expect(wxTokenPayload.message).toBe('微信 Token 响应格式异常')
    expect(wxTokenPayload.data.issues.some(issue => issue.path === 'access_token')).toBe(false)

    const uploadResponse = await makeAuthedJsonRequest('/api/v1/upload/cos', accessToken, {
      filename: 'cover.png',
      folder: { name: 'wx' },
    })
    const uploadPayload = await uploadResponse.json() as {
      code: number
      message: string
    }
    expect(uploadResponse.status).toBe(400)
    expect(uploadPayload.message).toBe('COS STS 响应格式异常')

    restoreFetch()
  })

  test('upload route signs cos credentials for super admin', async () => {
    setFetchMock(async () => Response.json({
      Response: {
        Credentials: {
          TmpSecretId: 'tmp-id',
          TmpSecretKey: 'tmp-key',
          Token: 'tmp-token',
        },
        ExpiredTime: 1_900_000_000,
      },
    }))

    const uploadResponse = await makeAuthedJsonRequest('/api/v1/upload/cos', accessToken, {
      filename: 'cover.png',
      folder: { name: 'wx' },
    })
    const uploadPayload = await uploadResponse.json() as {
      code: number
      data: {
        TmpSecretId: string
        TmpSecretKey: string
        SessionToken: string
        Bucket: string
        Region: string
        Key: string
      }
    }

    expect(uploadResponse.status).toBe(200)
    expect(uploadPayload.code).toBe(0)
    expect(uploadPayload.data.TmpSecretId).toBe('tmp-id')
    expect(uploadPayload.data.SessionToken).toBe('tmp-token')
    expect(uploadPayload.data.Key.includes('/wx/')).toBe(true)

    restoreFetch()
  })

  test('responses include request id and emit structured request logs', async () => {
    await withConsoleCapture(async (logs) => {
      const response = await makeRequest('/health', { method: 'GET' })
      const requestId = response.headers.get('x-request-id') || ''

      expect(response.status).toBe(200)
      expect(requestId.length).toBeGreaterThan(0)
      expect(logs.info.some(line => line.includes('"event":"request.started"'))).toBe(true)
      expect(logs.info.some(line => line.includes('"event":"request.completed"'))).toBe(true)
      expect(logs.info.some(line => line.includes(requestId))).toBe(true)
    })
  })

  test('audit logs are written for sensitive actions', async () => {
    setFetchMock(async () => Response.json({
      Response: {
        Credentials: {
          TmpSecretId: 'tmp-id',
          TmpSecretKey: 'tmp-key',
          Token: 'tmp-token',
        },
        ExpiredTime: 1_900_000_000,
      },
    }))

    const generateResponse = await makeAuthedJsonRequest('/api/v1/token/generate', accessToken, {
      note: 'audit-check',
      expiresInDays: 3,
      scopes: ['upload'],
    })
    const generateRequestId = generateResponse.headers.get('x-request-id') || ''
    expect(generateResponse.status).toBe(200)

    const uploadResponse = await makeAuthedJsonRequest('/api/v1/upload/cos', accessToken, {
      filename: 'cover.png',
      folder: { name: 'audit' },
    })
    const uploadRequestId = uploadResponse.headers.get('x-request-id') || ''
    expect(uploadResponse.status).toBe(200)

    const auditRows = dbModule.db.query<{
      request_id: string | null
      action: string
      actor_user_id: string | null
      status: string
      target_type: string | null
      metadata_json: string | null
    }, []>(`
      SELECT request_id, action, actor_user_id, status, target_type, metadata_json
      FROM audit_logs
      ORDER BY created_at DESC
    `).all()

    expect(auditRows.some(row =>
      row.request_id === generateRequestId
      && row.action === 'token.generate_pat'
      && row.actor_user_id === adminUserId
      && row.status === 'success'
      && row.metadata_json?.includes('audit-check'),
    )).toBe(true)

    expect(auditRows.some(row =>
      row.request_id === uploadRequestId
      && row.action === 'upload.issue_cos_credential'
      && row.actor_user_id === adminUserId
      && row.target_type === 'cos_object',
    )).toBe(true)

    restoreFetch()
  })

  test('readiness endpoint exposes migration metadata', async () => {
    const readyResponse = await makeRequest('/ready', { method: 'GET' })
    const readyPayload = await readyResponse.json() as {
      data: {
        status: string
        databasePath: string
      }
    }

    const migrationRows = dbModule.db.query<{ id: string }, []>('SELECT id FROM schema_migrations ORDER BY id ASC').all()

    expect(readyResponse.status).toBe(200)
    expect(readyPayload.data.status).toBe('ok')
    expect(existsSync(readyPayload.data.databasePath)).toBe(true)
    expect(migrationRows.length).toBeGreaterThan(0)
  })
})

afterAll(() => {
  restoreFetch()
  console.info = originalConsoleInfo
  console.error = originalConsoleError
  dbModule.closeDatabase()
})
