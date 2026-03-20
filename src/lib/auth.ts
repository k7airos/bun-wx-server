import { db } from '../db'
import { config } from '../config'
import { API_CODES } from './api-codes'
import { badRequest, forbidden, unauthorized } from './errors'
import { signJwt, verifyJwt } from './jwt'
import { isNonEmptyString, randomId, randomToken, sha256 } from './utils'

export const PAT_SCOPES = {
  all: { label: '全部权限', paths: ['/api/v1/'] },
  wx: { label: '微信接口', paths: ['/api/v1/wx/'] },
  memo: { label: '动态管理', paths: ['/api/v1/memo/'] },
  comment: { label: '评论管理', paths: ['/api/v1/comment/'] },
  upload: { label: '文件上传', paths: ['/api/v1/upload/'] },
  user: { label: '用户信息', paths: ['/api/v1/user/'] },
} as const

export type PatScopeKey = keyof typeof PAT_SCOPES

type UserRow = {
  id: string
  username: string
  nickname: string | null
  password_hash: string
  role: string
  status: number
}

const getUserByUsernameStmt = db.query<UserRow, [string]>(`
  SELECT id, username, nickname, password_hash, role, status
  FROM users
  WHERE username = ?
  LIMIT 1
`)

const getUserByIdStmt = db.query<UserRow, [string]>(`
  SELECT id, username, nickname, password_hash, role, status
  FROM users
  WHERE id = ?
  LIMIT 1
`)

const countUsersStmt = db.query<{ total: number }, []>('SELECT COUNT(*) as total FROM users')

const insertUserStmt = db.prepare(`
  INSERT INTO users (id, username, nickname, password_hash, role)
  VALUES (?, ?, ?, ?, ?)
`)

const insertRefreshTokenStmt = db.prepare(`
  INSERT INTO refresh_tokens (id, user_id, token_hash, scope, expires_at)
  VALUES (?, ?, ?, ?, ?)
`)

const revokeRefreshTokenStmt = db.prepare(`
  UPDATE refresh_tokens
  SET is_revoked = 1
  WHERE token_hash = ?
`)

const findRefreshTokenStmt = db.query<{
  id: string
  user_id: string
  token_hash: string
  scope: string
  is_revoked: number
  expires_at: string
}, [string]>(`
  SELECT id, user_id, token_hash, scope, is_revoked, expires_at
  FROM refresh_tokens
  WHERE token_hash = ?
  LIMIT 1
`)

const insertPatStmt = db.prepare(`
  INSERT INTO personal_access_tokens (id, user_id, token_hash, note, scope, expires_at)
  VALUES (?, ?, ?, ?, ?, ?)
`)

const findPatStmt = db.query<{
  user_id: string
  scope: string
  is_revoked: number
  expires_at: string
}, [string]>(`
  SELECT user_id, scope, is_revoked, expires_at
  FROM personal_access_tokens
  WHERE token_hash = ?
  LIMIT 1
`)

export function getUserCount() {
  return Number(countUsersStmt.get()?.total || 0)
}

function ensurePassword(password: string) {
  if (!isNonEmptyString(password)) {
    throw badRequest('password 不能为空')
  }
  if (password === 'NEED_RESET_PASSWORD') {
    throw badRequest('未设置密码，请使用其他登录方式')
  }
}

function serializeUser(user: UserRow) {
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    role: user.role,
    status: user.status,
  }
}

export function isPathAllowedByScope(scope: string, pathname: string) {
  if (scope === 'all') {
    return true
  }

  const simpleScope = PAT_SCOPES[scope as PatScopeKey]
  if (simpleScope) {
    return simpleScope.paths.some(item => pathname.startsWith(item))
  }

  const scopeMatch = scope.match(/^scopes:([^|]+)/)
  if (!scopeMatch) {
    return false
  }

  const scopeKeys = scopeMatch[1].split(',') as PatScopeKey[]
  if (scopeKeys.includes('all')) {
    return true
  }

  return scopeKeys.some((scopeKey) => {
    const entry = PAT_SCOPES[scopeKey]
    return entry?.paths.some(path => pathname.startsWith(path))
  })
}

export async function createUser(input: {
  username: string
  password: string
  nickname?: string
  role?: string
}) {
  if (!isNonEmptyString(input.username)) {
    throw badRequest('username 不能为空')
  }
  ensurePassword(input.password)

  const existingUser = getUserByUsernameStmt.get(input.username)
  if (existingUser) {
    throw badRequest('用户已存在')
  }

  const passwordHash = await Bun.password.hash(input.password)
  const id = crypto.randomUUID()
  const nickname = isNonEmptyString(input.nickname) ? input.nickname : input.username
  const role = input.role || 'user'
  insertUserStmt.run(id, input.username, nickname, passwordHash, role)

  const created = getUserByIdStmt.get(id)
  if (!created) {
    throw badRequest('创建用户失败')
  }

  return serializeUser(created)
}

export async function createInitialAdmin(username: string, password: string, nickname?: string) {
  if (getUserCount() > 0) {
    throw forbidden('管理员已初始化，拒绝重复执行', API_CODES.FORBIDDEN)
  }

  return await createUser({
    username,
    password,
    nickname,
    role: 'superAdmin',
  })
}

export async function loginUser(username: string, password: string) {
  if (getUserCount() === 0) {
    throw forbidden('服务尚未初始化，请先执行 init-admin 创建管理员', API_CODES.FORBIDDEN)
  }
  if (!isNonEmptyString(username)) {
    throw badRequest('username 不能为空')
  }
  ensurePassword(password)

  const user = getUserByUsernameStmt.get(username)
  if (!user) {
    throw unauthorized('账号或密码错误', API_CODES.AUTH_FAILED)
  }

  const isValid = await Bun.password.verify(password, user.password_hash)
  if (!isValid) {
    throw unauthorized('账号或密码错误', API_CODES.AUTH_FAILED)
  }

  const tokenPair = createTokenPair(user.id)
  return {
    accessToken: tokenPair.accessToken,
    refreshToken: tokenPair.refreshToken,
    accessExpiresAt: tokenPair.accessExpiresAt,
    refreshExpiresAt: tokenPair.refreshExpiresAt,
    user: serializeUser(user),
  }
}

export function createTokenPair(userId: string, scope = 'all') {
  const accessToken = signJwt({ userId, scope })
  const refreshToken = randomToken('', 48)
  const refreshTokenHash = sha256(refreshToken)
  const now = Date.now()
  const accessExpiresAt = new Date(now + config.jwtExpiresInSeconds * 1000).toISOString()
  const refreshExpiresAt = new Date(now + config.refreshTokenExpiresInSeconds * 1000).toISOString()

  insertRefreshTokenStmt.run(
    randomId(16),
    userId,
    refreshTokenHash,
    scope,
    refreshExpiresAt,
  )

  return {
    accessToken,
    refreshToken,
    accessExpiresAt,
    refreshExpiresAt,
  }
}

export function refreshAccessToken(refreshToken: string) {
  if (!isNonEmptyString(refreshToken)) {
    throw badRequest('refreshToken 不能为空')
  }

  const refreshTokenHash = sha256(refreshToken)
  const row = findRefreshTokenStmt.get(refreshTokenHash)
  revokeRefreshTokenStmt.run(refreshTokenHash)

  if (!row || row.is_revoked || new Date(row.expires_at).getTime() <= Date.now()) {
    throw unauthorized('Refresh token 无效或已过期，请重新登录', API_CODES.REFRESH_TOKEN_EXPIRED)
  }

  return createTokenPair(row.user_id, row.scope)
}

export function generatePAT(userId: string, note: string, scopes: PatScopeKey[], expiresInDays = 365) {
  if (!isNonEmptyString(note)) {
    throw badRequest('note 不能为空')
  }
  if (!Array.isArray(scopes) || scopes.length === 0) {
    throw badRequest('scopes 至少需要一个值')
  }
  scopes.forEach((scope) => {
    if (!PAT_SCOPES[scope]) {
      throw badRequest(`不支持的 scope: ${scope}`)
    }
  })

  const rawToken = randomToken('pat_', 32)
  const tokenHash = sha256(rawToken)
  const expiresAt = expiresInDays === 0
    ? '2099-12-31T00:00:00.000Z'
    : new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
  const scopeString = `scopes:${scopes.join(',')}|note:${note}`

  insertPatStmt.run(
    randomId(16),
    userId,
    tokenHash,
    note,
    scopeString,
    expiresAt,
  )

  return {
    token: rawToken,
    note,
    scope: scopeString,
    expiresAt,
  }
}

export function verifyPAT(token: string) {
  if (!token.startsWith('pat_')) {
    return { isAuth: false }
  }

  const row = findPatStmt.get(sha256(token))
  if (!row || row.is_revoked || new Date(row.expires_at).getTime() <= Date.now()) {
    return { isAuth: false }
  }

  return {
    isAuth: true,
    userId: row.user_id,
    scope: row.scope,
  }
}

export function getCurrentUser(userId: string) {
  const user = getUserByIdStmt.get(userId)
  if (!user) {
    throw unauthorized('用户不存在', API_CODES.TOKEN_INVALID)
  }
  return serializeUser(user)
}

export function resolveBearerToken(request: Request) {
  const header = request.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) {
    return null
  }
  return header.slice('Bearer '.length).trim() || null
}

export function authenticateRequest(request: Request, pathname: string) {
  const token = resolveBearerToken(request)
  if (!token) {
    return null
  }

  const jwtResult = verifyJwt(token)
  if (jwtResult.isAuth && jwtResult.payload?.userId) {
    const user = getCurrentUser(jwtResult.payload.userId)
    return {
      userId: user.id,
      role: user.role,
      scope: 'all',
      tokenType: 'jwt' as const,
      user,
    }
  }

  const patResult = verifyPAT(token)
  if (patResult.isAuth && patResult.userId && patResult.scope) {
    if (!isPathAllowedByScope(patResult.scope, pathname)) {
      throw forbidden('该 Token 无权访问此接口', API_CODES.PERMISSION_DENIED)
    }
    const user = getCurrentUser(patResult.userId)
    return {
      userId: user.id,
      role: user.role,
      scope: patResult.scope,
      tokenType: 'pat' as const,
      user,
    }
  }

  throw unauthorized('登录已过期，请重新登录', API_CODES.TOKEN_EXPIRED)
}

export function requireAuth(request: Request, pathname: string) {
  const auth = authenticateRequest(request, pathname)
  if (!auth) {
    throw unauthorized()
  }
  return auth
}

export function requireSuperAdmin(role: string) {
  if (role !== 'superAdmin') {
    throw forbidden('无权限访问', API_CODES.PERMISSION_DENIED)
  }
}
