import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const tempRoot = mkdtempSync(join(tmpdir(), 'blog-wx-bun-service-'))

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-secret-for-service-tests'
process.env.DATABASE_PATH = join(tempRoot, 'app.sqlite')

const serverModule = await import('../src/server')
const authModule = await import('../src/lib/auth')
const dbModule = await import('../src/db')

const fetchHandler = serverModule.createAppFetch()

function makeJsonRequest(pathname: string, body: unknown, init: RequestInit = {}) {
  return fetchHandler(new Request(`http://localhost${pathname}`, {
    method: init.method || 'POST',
    headers: {
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
    body: JSON.stringify(body),
  }))
}

describe('service bootstrap and auth flow', () => {
  beforeAll(() => {
    dbModule.runMigrations()
  })

  test('rejects login before init-admin', async () => {
    const response = await makeJsonRequest('/api/v1/user/login', {
      username: 'admin',
      password: 'secret123',
    })
    const payload = await response.json() as { message: string }

    expect(response.status).toBe(403)
    expect(payload.message).toContain('init-admin')
  })

  test('creates initial admin and completes login/refresh', async () => {
    const user = await authModule.createInitialAdmin('admin', 'secret123', 'Administrator')
    expect(user.role).toBe('superAdmin')

    const loginResponse = await makeJsonRequest('/api/v1/user/login', {
      username: 'admin',
      password: 'secret123',
    })
    const loginPayload = await loginResponse.json() as {
      data: {
        accessToken: string
        refreshToken: string
        user: { role: string }
      }
    }

    expect(loginResponse.status).toBe(200)
    expect(loginPayload.data.user.role).toBe('superAdmin')
    expect(loginPayload.data.accessToken.length).toBeGreaterThan(20)

    const refreshResponse = await makeJsonRequest('/api/v1/auth/refresh', {
      refreshToken: loginPayload.data.refreshToken,
    })
    const refreshPayload = await refreshResponse.json() as {
      data: {
        accessToken: string
        refreshToken: string
      }
    }

    expect(refreshResponse.status).toBe(200)
    expect(refreshPayload.data.accessToken.length).toBeGreaterThan(20)
    expect(refreshPayload.data.refreshToken).not.toBe(loginPayload.data.refreshToken)
  })

  test('exposes readiness and migration metadata', async () => {
    const readyResponse = await fetchHandler(new Request('http://localhost/ready'))
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
  dbModule.closeDatabase()
  rmSync(tempRoot, { recursive: true, force: true })
})
