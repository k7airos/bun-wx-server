import { API_CODES } from '../../lib/api-codes'
import { createTokenPair, getCurrentUser } from '../../lib/auth'
import { ApiError, badRequest } from '../../lib/errors'
import { isNonEmptyString, randomId, randomToken } from '../../lib/utils'
import {
  deleteOAuthState,
  findExchangeCode,
  findOAuthAccount,
  findOAuthState,
  findUserIdByEmail,
  findUserIdByUsername,
  insertExchangeCode,
  insertOAuthAccount,
  insertOAuthState,
  insertOAuthUser,
  markExchangeCodeUsed,
  updateOAuthAccount,
} from './repository'
import type { OAuthNormalizedUser, OAuthProviderAdapter } from './types'

function safeRedirectPath(value: string | null) {
  if (!value || !value.startsWith('/')) {
    return '/'
  }
  return value
}

function normalizeUsername(login: string) {
  return login.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50) || `oauth_${randomId(4)}`
}

async function ensureLocalUser(provider: string, user: OAuthNormalizedUser) {
  const existingOAuth = findOAuthAccount(provider, user.providerUserId)

  if (existingOAuth?.user_id) {
    updateOAuthAccount({
      id: existingOAuth.id,
      userId: existingOAuth.user_id,
      login: user.login,
      email: user.email,
      avatarUrl: user.avatarUrl,
      accessToken: user.accessToken || null,
    })
    return existingOAuth.user_id
  }

  let userId = ''
  if (user.email) {
    userId = findUserIdByEmail(user.email) || ''
  }

  if (!userId) {
    let username = normalizeUsername(user.login || `${provider}_${user.providerUserId}`)
    while (findUserIdByUsername(username)) {
      username = `${normalizeUsername(user.login || provider)}_${randomId(2)}`
    }

    userId = crypto.randomUUID()
    const passwordHash = await Bun.password.hash(randomToken('', 24))
    insertOAuthUser({
      id: userId,
      username,
      nickname: user.login || username,
      email: user.email,
      avatarUrl: user.avatarUrl,
      passwordHash,
    })
  }

  if (existingOAuth) {
    updateOAuthAccount({
      id: existingOAuth.id,
      userId,
      login: user.login,
      email: user.email,
      avatarUrl: user.avatarUrl,
      accessToken: user.accessToken || null,
    })
    return userId
  }

  insertOAuthAccount({
    id: randomId(16),
    provider,
    providerUserId: user.providerUserId,
    userId,
    login: user.login,
    email: user.email,
    avatarUrl: user.avatarUrl,
    accessToken: user.accessToken || null,
  })

  return userId
}

export function createOAuthAuthorizeRedirect(adapter: OAuthProviderAdapter, input: {
  requestUrl: URL
  stateExpiresInSeconds: number
}) {
  const redirectPath = safeRedirectPath(input.requestUrl.searchParams.get('redirect'))
  const state = randomToken('', 24)
  const expiresAt = new Date(Date.now() + input.stateExpiresInSeconds * 1000).toISOString()

  insertOAuthState({
    id: randomId(16),
    provider: adapter.name,
    state,
    redirectPath,
    expiresAt,
  })

  return Response.redirect(adapter.buildAuthorizeUrl({ state }).toString(), 302)
}

export async function handleOAuthCallback(adapter: OAuthProviderAdapter, input: {
  requestUrl: URL
  frontendCallbackUrl: string
  exchangeCodeExpiresInSeconds: number
}) {
  const error = input.requestUrl.searchParams.get('error')
  if (error) {
    throw new ApiError(400, API_CODES.AUTH_FAILED, `${adapter.name} 授权失败: ${error}`)
  }

  const code = input.requestUrl.searchParams.get('code')
  const state = input.requestUrl.searchParams.get('state')
  if (!isNonEmptyString(code) || !isNonEmptyString(state)) {
    throw badRequest(`缺少 ${adapter.name} OAuth 回调参数 code/state`)
  }

  const stateRow = findOAuthState(adapter.name, state)
  if (!stateRow || new Date(stateRow.expires_at).getTime() <= Date.now()) {
    throw new ApiError(400, API_CODES.AUTH_FAILED, 'OAuth state 无效或已过期')
  }
  deleteOAuthState(stateRow.id)

  const accessToken = await adapter.exchangeCode(code)
  const normalizedUser = await adapter.fetchNormalizedUser(accessToken)
  const userId = await ensureLocalUser(adapter.name, {
    ...normalizedUser,
    accessToken,
  })

  const exchangeCode = randomToken('', 20)
  const exchangeExpiresAt = new Date(Date.now() + input.exchangeCodeExpiresInSeconds * 1000).toISOString()
  insertExchangeCode({
    id: randomId(16),
    userId,
    code: exchangeCode,
    redirectPath: stateRow.redirect_path || '/',
    expiresAt: exchangeExpiresAt,
  })

  const redirectUrl = new URL(input.frontendCallbackUrl)
  redirectUrl.searchParams.set('code', exchangeCode)
  redirectUrl.searchParams.set('redirect', stateRow.redirect_path || '/')
  return Response.redirect(redirectUrl.toString(), 302)
}

export function exchangeOAuthCode(code: string) {
  if (!isNonEmptyString(code)) {
    throw badRequest('code 不能为空')
  }

  const codeRow = findExchangeCode(code)
  if (!codeRow || codeRow.is_used || new Date(codeRow.expires_at).getTime() <= Date.now()) {
    throw new ApiError(400, API_CODES.AUTH_FAILED, '授权码无效或已过期')
  }

  markExchangeCodeUsed(codeRow.id)
  const tokenPair = createTokenPair(codeRow.user_id)
  const user = getCurrentUser(codeRow.user_id)

  return {
    accessToken: tokenPair.accessToken,
    refreshToken: tokenPair.refreshToken,
    accessExpiresAt: tokenPair.accessExpiresAt,
    refreshExpiresAt: tokenPair.refreshExpiresAt,
    user,
  }
}
