import { afterAll, describe, expect, test } from 'bun:test'
import { makeTempDir, removeSync } from '../src/lib/bun-fs'
import { joinPath } from '../src/lib/path'

const tempRoot = makeTempDir('blog-wx-bun-service-unit')

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-secret-for-unit-tests'
process.env.DATABASE_PATH = joinPath(tempRoot, 'app.sqlite')
process.env.COS_SECRET_ID = 'test-secret-id'
process.env.COS_SECRET_KEY = 'test-secret-key'
process.env.COS_BUCKET = 'test-bucket-1250000000'
process.env.COS_REGION = 'ap-guangzhou'
process.env.APP_ALLOWED_SOURCES = 'zotepad,zotepad-desktop'
process.env.GITHUB_CLIENT_ID = 'github-client-id'
process.env.GITHUB_CLIENT_SECRET = 'github-client-secret'
process.env.GITHUB_CALLBACK_URL = 'http://localhost/api/v1/auth/github/callback'
process.env.OAUTH_FRONTEND_CALLBACK_URL = 'http://frontend.local/auth/callback'

const policyModule = await import('../src/modules/auth/policy')
const auditModule = await import('../src/modules/audit')
const dbModule = await import('../src/db')
const loggerModule = await import('../src/lib/logger')
const routeUtilsModule = await import('../src/routes/utils')

const { isPathAllowedByScope, parseScope } = policyModule
const { cleanupAuditLogs, recordAuditLog } = auditModule
const { db, runMigrations } = dbModule
const { sanitizeLogPayload } = loggerModule
const { matchRoutePath } = routeUtilsModule

runMigrations()

describe('policy helpers', () => {
  test('parseScope keeps compatibility with legacy PAT format', () => {
    expect(parseScope('pat:legacy-note')).toEqual({
      scopes: ['all'],
      note: 'legacy-note',
    })

    expect(parseScope('scopes:wx,upload|note:robot')).toEqual({
      scopes: ['wx', 'upload'],
      note: 'robot',
    })
  })

  test('isPathAllowedByScope enforces declared scope prefixes', () => {
    expect(isPathAllowedByScope('all', '/api/v1/token/list')).toBe(true)
    expect(isPathAllowedByScope('wx', '/api/v1/wx/cgi-bin/token')).toBe(true)
    expect(isPathAllowedByScope('wx', '/api/v1/upload/cos')).toBe(false)
    expect(isPathAllowedByScope('scopes:wx,upload|note:bot', '/api/v1/upload/cos')).toBe(true)
    expect(isPathAllowedByScope('scopes:user|note:bot', '/api/v1/token/list')).toBe(false)
  })
})

describe('route helpers', () => {
  test('matchRoutePath extracts params and rejects mismatched paths', () => {
    expect(matchRoutePath('/api/v1/token/:id', '/api/v1/token/abc123')).toEqual({ id: 'abc123' })
    expect(matchRoutePath('/api/v1/user/:id', '/api/v1/user')).toBeNull()
    expect(matchRoutePath('/api/v1/user/:id', '/api/v1/token/abc123')).toBeNull()
  })
})

describe('logger helpers', () => {
  test('sanitizeLogPayload redacts nested secrets and tokens', () => {
    const sanitized = sanitizeLogPayload({
      password: 'plain-text',
      profile: {
        refreshToken: 'refresh-token',
        nickname: 'tester',
      },
      headers: {
        authorization: 'Bearer secret',
      },
      tags: [
        {
          apiKey: 'key-1',
          visible: true,
        },
      ],
    })

    expect(sanitized.password).toBe('[REDACTED]')
    expect((sanitized.profile as Record<string, unknown>).refreshToken).toBe('[REDACTED]')
    expect((sanitized.headers as Record<string, unknown>).authorization).toBe('[REDACTED]')
    expect(((sanitized.tags as Array<Record<string, unknown>>)[0]).apiKey).toBe('[REDACTED]')
    expect((sanitized.profile as Record<string, unknown>).nickname).toBe('tester')
  })
})

describe('audit service', () => {
  test('cleanupAuditLogs only removes records older than cutoff', () => {
    recordAuditLog({
      action: 'test.audit.cleanup.keep',
      actorUserId: 'tester',
      metadata: { marker: 'keep' },
    })
    recordAuditLog({
      action: 'test.audit.cleanup.delete',
      actorUserId: 'tester',
      metadata: { marker: 'delete' },
    })

    db.prepare(`
      UPDATE audit_logs
      SET created_at = ?
      WHERE action = 'test.audit.cleanup.delete'
    `).run('2000-01-01T00:00:00.000Z')

    const result = cleanupAuditLogs(30)

    const remainingActions = db.query<{ action: string }, []>(`
      SELECT action
      FROM audit_logs
      WHERE action IN ('test.audit.cleanup.keep', 'test.audit.cleanup.delete')
      ORDER BY action ASC
    `).all()

    expect(result.deletedCount).toBeGreaterThanOrEqual(1)
    expect(result.matchedBeforeCleanup).toBeGreaterThanOrEqual(1)
    expect(remainingActions.map(item => item.action)).toEqual(['test.audit.cleanup.keep'])
  })
})

afterAll(() => {
  removeSync(tempRoot)
})
