import { config } from '../../config'
import { API_CODES } from '../../lib/api-codes'
import { badRequest, forbidden, unauthorized } from '../../lib/errors'
import { signJwt, verifyJwt } from '../../lib/jwt'
import { isNonEmptyString, randomId, randomToken, sha256 } from '../../lib/utils'
import { PAT_SCOPES, type PatScopeKey, isPathAllowedByScope, parseScope, requireSuperAdmin } from './policy'
import {
  findPersonalAccessTokenByHash,
  findRefreshTokenByHash,
  insertPersonalAccessToken,
  insertRefreshToken,
  listPersonalAccessTokensByUserId,
  revokePersonalAccessToken,
  revokeRefreshTokenByHash,
} from './repositories/token-repository'
import {
  countUsers,
  findUserByNicknameExcludingId,
  findUserByUsernameExcludingId,
  getUserById,
  getUserByUsername,
  insertUser,
  listUserRows,
  updateUserRecord,
} from './repositories/user-repository'
import type { AuthContext, SerializedUser, UserRow } from './types'

function ensurePassword(password: string) {
  if (!isNonEmptyString(password)) {
    throw badRequest('password 不能为空')
  }
  if (password === 'NEED_RESET_PASSWORD') {
    throw badRequest('未设置密码，请使用其他登录方式')
  }
}

function serializeUser(user: UserRow): SerializedUser {
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    email: user.email,
    role: user.role,
    avatarUrl: user.avatar_url,
    website: user.website,
    status: user.status,
  }
}

export { PAT_SCOPES, isPathAllowedByScope, requireSuperAdmin }
export type { PatScopeKey }

export function getUserCount() {
  return countUsers()
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

  const existingUser = getUserByUsername(input.username)
  if (existingUser) {
    throw badRequest('用户已存在')
  }

  const passwordHash = await Bun.password.hash(input.password)
  const id = crypto.randomUUID()
  const nickname = isNonEmptyString(input.nickname) ? input.nickname : input.username
  const role = input.role || 'user'
  insertUser({
    id,
    username: input.username,
    nickname,
    passwordHash,
    role,
  })

  const created = getUserById(id)
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

  const user = getUserByUsername(username)
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

  insertRefreshToken({
    id: randomId(16),
    userId,
    tokenHash: refreshTokenHash,
    scope,
    expiresAt: refreshExpiresAt,
  })

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
  const row = findRefreshTokenByHash(refreshTokenHash)
  revokeRefreshTokenByHash(refreshTokenHash)

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

  insertPersonalAccessToken({
    id: randomId(16),
    userId,
    tokenHash,
    note,
    scope: scopeString,
    expiresAt,
  })

  return {
    token: rawToken,
    note,
    scope: scopeString,
    expiresAt,
  }
}

export function listPATs(userId: string) {
  return listPersonalAccessTokensByUserId(userId)
    .filter(pat => !pat.is_revoked && (pat.scope.startsWith('pat:') || pat.scope.startsWith('scopes:')))
    .map((pat) => {
      const { scopes, note } = parseScope(pat.scope)
      return {
        id: pat.id,
        note,
        scopes,
        createdAt: pat.created_at,
        expiresAt: pat.expires_at,
      }
    })
}

export function revokePAT(userId: string, id: string) {
  revokePersonalAccessToken(userId, id)
  return { success: true }
}

export function verifyPAT(token: string) {
  if (!token.startsWith('pat_')) {
    return { isAuth: false as const }
  }

  const row = findPersonalAccessTokenByHash(sha256(token))
  if (!row || row.is_revoked || new Date(row.expires_at).getTime() <= Date.now()) {
    return { isAuth: false as const }
  }

  return {
    isAuth: true as const,
    userId: row.user_id,
    scope: row.scope,
  }
}

export function getCurrentUser(userId: string) {
  const user = getUserById(userId)
  if (!user) {
    throw unauthorized('用户不存在', API_CODES.TOKEN_INVALID)
  }
  return serializeUser(user)
}

export function getUserDetail(userId: string) {
  const user = getUserById(userId)
  return user ? serializeUser(user) : null
}

export function listUsers() {
  return listUserRows().map(serializeUser)
}

export async function updateUserById(actorRole: string, userId: string, input: {
  email?: string
  nickname?: string
  username?: string
  password?: string
  website?: string
  avatar_url?: string
}) {
  requireSuperAdmin(actorRole)

  const existingUser = getUserById(userId)
  if (!existingUser) {
    throw badRequest('用户不存在')
  }

  const nextData = Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== null),
  )

  if (Object.keys(nextData).length === 0) {
    throw badRequest('没有需要更新的字段')
  }

  if (typeof nextData.nickname === 'string') {
    const duplicated = findUserByNicknameExcludingId(nextData.nickname, userId)
    if (duplicated) {
      throw badRequest('昵称已经存在')
    }
  }

  if (typeof nextData.username === 'string') {
    const duplicated = findUserByUsernameExcludingId(nextData.username, userId)
    if (duplicated) {
      throw badRequest('用户名已经存在')
    }
  }

  const passwordHash = typeof nextData.password === 'string'
    ? await Bun.password.hash(nextData.password)
    : null

  updateUserRecord(userId, {
    email: nextData.email ?? null,
    nickname: nextData.nickname ?? null,
    username: nextData.username ?? null,
    passwordHash,
    website: nextData.website ?? null,
    avatarUrl: nextData.avatar_url ?? null,
  })

  return getCurrentUser(userId)
}

export function resolveBearerToken(request: Request) {
  const header = request.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) {
    return null
  }
  return header.slice('Bearer '.length).trim() || null
}

export function authenticateRequest(request: Request, pathname: string): AuthContext | null {
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
      tokenType: 'jwt',
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
      tokenType: 'pat',
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
