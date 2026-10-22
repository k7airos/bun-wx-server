import { config } from '../../config'
import { db } from '../../db'
import { API_CODES } from '../../lib/api-codes'
import { ApiError, badRequest } from '../../lib/errors'
import { randomId, sha256 } from '../../lib/utils'
import { resolveBearerToken } from '../auth'
import type { AuthContext } from '../auth'

const IDEMPOTENCY_KEY_MAX_LENGTH = 200
const IDEMPOTENCY_WAIT_TIMEOUT_MS = 15000
const IDEMPOTENCY_WAIT_INTERVAL_MS = 50
const IDEMPOTENCY_PENDING_STALE_MS = 60000
const IDEMPOTENCY_MAX_ATTEMPTS = 400

type IdempotencyRow = {
  id: string
  scope_key: string
  idempotency_key: string
  operation: string
  status: string
  request_fingerprint: string
  response_json: string | null
  claimed_at: string
  expires_at: string
}

const selectIdempotencyStmt = db.query<IdempotencyRow, [string, string]>(`
  SELECT id, scope_key, idempotency_key, operation, status, request_fingerprint, response_json, claimed_at, expires_at
  FROM wx_idempotency_keys
  WHERE scope_key = ? AND idempotency_key = ?
  LIMIT 1
`)

const insertIdempotencyStmt = db.prepare(`
  INSERT INTO wx_idempotency_keys (
    id,
    scope_key,
    idempotency_key,
    operation,
    status,
    request_fingerprint,
    response_json,
    claimed_at,
    expires_at
  ) VALUES (?, ?, ?, ?, 'pending', ?, NULL, ?, ?)
`)

const completeIdempotencyStmt = db.prepare(`
  UPDATE wx_idempotency_keys
  SET status = 'complete',
      response_json = ?,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`)

const deleteIdempotencyByIdStmt = db.prepare(`
  DELETE FROM wx_idempotency_keys
  WHERE id = ?
`)

const deleteExpiredIdempotencyStmt = db.prepare(`
  DELETE FROM wx_idempotency_keys
  WHERE expires_at <= ?
`)

const countIdempotencyStmt = db.query<{ count: number }, []>(`
  SELECT COUNT(*) AS count
  FROM wx_idempotency_keys
`)

/**
 * 读取幂等键，缺失或空值视为未开启幂等；过长直接拒绝，避免把任意内容写进存储。
 */
export function readIdempotencyKey(request: Request): string | null {
  const raw = request.headers.get('idempotency-key')
  if (raw === null) {
    return null
  }

  const value = raw.trim()
  if (!value) {
    return null
  }
  if (value.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
    throw badRequest(`Idempotency-Key 长度不能超过 ${IDEMPOTENCY_KEY_MAX_LENGTH}`)
  }

  return value
}

/**
 * 幂等作用域按调用方隔离：PAT 用凭证指纹，JWT 用用户身份，
 * 避免不同账号之间命中同一个幂等键。
 */
export function resolveIdempotencyScope(request: Request, auth: AuthContext | null): string {
  const userId = auth?.userId || 'anonymous'
  const tokenType = auth?.tokenType || 'none'

  if (tokenType === 'pat') {
    const token = resolveBearerToken(request) || ''
    return `pat:${sha256(token).slice(0, 32)}`
  }

  return `${tokenType}:${sha256(userId).slice(0, 32)}`
}

export function buildRequestFingerprint(operation: string, payload: unknown) {
  return sha256(`${operation}:${JSON.stringify(payload)}`)
}

export function countIdempotencyKeys() {
  return countIdempotencyStmt.get()?.count || 0
}

/**
 * 清理过期记录，避免幂等表无限增长。
 */
export function cleanupExpiredIdempotencyKeys(now: Date = new Date()) {
  const cutoffIso = now.toISOString()
  const result = deleteExpiredIdempotencyStmt.run(cutoffIso)

  return {
    cutoffIso,
    deletedCount: Number(result.changes || 0),
    totalAfterCleanup: countIdempotencyKeys(),
  }
}

function isUniqueConstraintError(error: unknown) {
  const code = (error as { code?: string } | null)?.code || ''
  return /SQLITE_CONSTRAINT_(UNIQUE|PRIMARYKEY)/i.test(code)
}

function isExpired(row: IdempotencyRow, now: number) {
  const expiresAt = new Date(row.expires_at).getTime()
  return !Number.isFinite(expiresAt) || expiresAt <= now
}

/**
 * 占位超过一定时间仍未完成，视为上一次执行被中断（例如进程重启），
 * 允许后来的请求重新执行，而不是一直等不到结果。
 */
function isStaleClaim(row: IdempotencyRow, now: number) {
  const claimedAt = new Date(row.claimed_at).getTime()
  if (!Number.isFinite(claimedAt)) {
    return true
  }
  return now - claimedAt > IDEMPOTENCY_PENDING_STALE_MS
}

const claimIdempotencyTx = db.transaction((input: {
  id: string
  scopeKey: string
  idempotencyKey: string
  operation: string
  fingerprint: string
  claimedAt: string
  expiresAt: string
  now: number
}): { claimed: boolean, id: string, existing: IdempotencyRow | null } => {
  const existing = selectIdempotencyStmt.get(input.scopeKey, input.idempotencyKey)
  if (existing) {
    const reclaimable = isExpired(existing, input.now)
      || (existing.status !== 'complete' && isStaleClaim(existing, input.now))
    if (!reclaimable) {
      return { claimed: false, id: existing.id, existing }
    }
    deleteIdempotencyByIdStmt.run(existing.id)
  }

  insertIdempotencyStmt.run(
    input.id,
    input.scopeKey,
    input.idempotencyKey,
    input.operation,
    input.fingerprint,
    input.claimedAt,
    input.expiresAt,
  )
  return { claimed: true, id: input.id, existing: null }
})

export type IdempotentWriteResult<T> = {
  data: T
  replayed: boolean
}

let lastCleanupAt = 0

function scheduleExpiredCleanup(now: number) {
  if (now - lastCleanupAt < 60_000) {
    return
  }
  lastCleanupAt = now
  cleanupExpiredIdempotencyKeys(new Date(now))
}

/**
 * 带幂等键的写操作：同一作用域内同一个键只会真正执行一次，
 * 重复请求直接返回首次响应，不再调用上游。
 */
export async function runIdempotentWrite<T>(input: {
  idempotencyKey: string | null
  scopeKey: string
  operation: string
  fingerprint: string
  execute: () => Promise<T>
}): Promise<IdempotentWriteResult<T>> {
  if (!input.idempotencyKey) {
    return { data: await input.execute(), replayed: false }
  }

  scheduleExpiredCleanup(Date.now())
  const deadline = Date.now() + IDEMPOTENCY_WAIT_TIMEOUT_MS

  for (let attempt = 0; attempt < IDEMPOTENCY_MAX_ATTEMPTS; attempt += 1) {
    const now = Date.now()
    const claimedAt = new Date(now).toISOString()
    const expiresAt = new Date(now + config.wxIdempotencyTtlSeconds * 1000).toISOString()
    const recordId = randomId(16)

    let claim: { claimed: boolean, id: string, existing: IdempotencyRow | null }
    try {
      claim = claimIdempotencyTx.immediate({
        id: recordId,
        scopeKey: input.scopeKey,
        idempotencyKey: input.idempotencyKey,
        operation: input.operation,
        fingerprint: input.fingerprint,
        claimedAt,
        expiresAt,
        now,
      })
    }
    catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error
      }
      // 并发抢占时唯一约束生效，说明另一个请求已经占位。
      const existing = selectIdempotencyStmt.get(input.scopeKey, input.idempotencyKey)
      if (!existing) {
        continue
      }
      claim = { claimed: false, id: existing.id, existing }
    }

    if (claim.claimed) {
      // 抢占成功：由本次请求负责执行上游写操作。
      try {
        const data = await input.execute()
        completeIdempotencyStmt.run(JSON.stringify(data ?? null), claim.id)
        return { data, replayed: false }
      }
      catch (error) {
        // 上游失败不缓存结果，释放占位允许调用方重试。
        deleteIdempotencyByIdStmt.run(claim.id)
        throw error
      }
    }

    const existing = claim.existing
    if (!existing) {
      continue
    }

    if (existing.request_fingerprint !== input.fingerprint) {
      throw new ApiError(409, API_CODES.DUPLICATE_ERROR, '该幂等键已用于其他请求内容，请检查原草稿', {
        wxIdempotencyKey: input.idempotencyKey,
      })
    }

    if (existing.status === 'complete') {
      return { data: parseStoredResponse<T>(existing.response_json), replayed: true }
    }

    if (Date.now() >= deadline) {
      throw new ApiError(409, API_CODES.DUPLICATE_ERROR, '相同幂等键的请求正在处理中，请稍后重试', {
        wxIdempotencyKey: input.idempotencyKey,
      })
    }

    await Bun.sleep(IDEMPOTENCY_WAIT_INTERVAL_MS)
  }

  throw new ApiError(409, API_CODES.DUPLICATE_ERROR, '相同幂等键的请求正在处理中，请稍后重试', {
    wxIdempotencyKey: input.idempotencyKey,
  })
}

function parseStoredResponse<T>(responseJson: string | null): T {
  if (!responseJson) {
    return null as T
  }

  try {
    return JSON.parse(responseJson) as T
  }
  catch {
    return null as T
  }
}
