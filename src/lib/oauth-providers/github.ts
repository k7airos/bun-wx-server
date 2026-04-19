import { config, assertGitHubOAuthConfig } from '../../config'
import { API_CODES } from '../api-codes'
import {
  githubAccessTokenResponseSchema,
  githubEmailResponseSchema,
  githubUserResponseSchema,
} from '../../modules/oauth/external-schemas'
import type { OAuthNormalizedUser, OAuthProviderAdapter } from '../oauth-core'
import { ApiError, internalError } from '../errors'
import { parseWithSchema } from '../validation'
import type { ZodType } from 'zod'

async function fetchGitHubJson<T>(url: string, init: RequestInit, schema: ZodType<T>, message: string) {
  const response = await fetch(url, init)
  if (!response.ok) {
    throw internalError(`GitHub OAuth 请求失败: HTTP ${response.status}`)
  }
  return parseWithSchema(schema, await response.json(), message)
}

export const githubOAuthProvider: OAuthProviderAdapter = {
  name: 'github',
  buildAuthorizeUrl({ state }) {
    assertGitHubOAuthConfig()

    const authorizeUrl = new URL('https://github.com/login/oauth/authorize')
    authorizeUrl.searchParams.set('client_id', config.githubClientId)
    authorizeUrl.searchParams.set('redirect_uri', config.githubCallbackUrl)
    authorizeUrl.searchParams.set('scope', 'read:user user:email')
    authorizeUrl.searchParams.set('state', state)
    return authorizeUrl
  },
  async exchangeCode(code) {
    assertGitHubOAuthConfig()

    const payload = await fetchGitHubJson(
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          client_id: config.githubClientId,
          client_secret: config.githubClientSecret,
          code,
          redirect_uri: config.githubCallbackUrl,
        }),
      },
      githubAccessTokenResponseSchema,
      'GitHub access token 响应格式异常',
    )

    if (!payload.access_token) {
      throw new ApiError(
        400,
        API_CODES.AUTH_FAILED,
        payload.error_description || payload.error || 'GitHub 授权失败',
      )
    }

    return payload.access_token
  },
  async fetchNormalizedUser(accessToken) {
    const user = await fetchGitHubJson('https://api.github.com/user', {
      method: 'GET',
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: 'application/vnd.github+json',
        'user-agent': 'blog-wx-bun-service',
      },
    }, githubUserResponseSchema, 'GitHub 用户信息响应格式异常')

    const emails = await fetchGitHubJson('https://api.github.com/user/emails', {
      method: 'GET',
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: 'application/vnd.github+json',
        'user-agent': 'blog-wx-bun-service',
      },
    }, githubEmailResponseSchema, 'GitHub 邮箱信息响应格式异常')

    const primaryVerifiedEmail = emails.find(item => item.primary && item.verified)?.email
      || emails.find(item => item.verified)?.email
      || user.email
      || null

    const normalized: OAuthNormalizedUser = {
      providerUserId: String(user.id),
      login: user.login || null,
      email: primaryVerifiedEmail,
      avatarUrl: user.avatar_url || null,
    }

    return normalized
  },
}
