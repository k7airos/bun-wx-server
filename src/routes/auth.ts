import {
  loginBodySchema,
  loginResponseSchema,
  refreshTokenBodySchema,
  refreshTokenResponseSchema,
} from '../modules/auth/schemas'
import {
  exchangeOAuthCodeBodySchema,
  exchangeOAuthCodeResponseSchema,
  githubAuthorizeQuerySchema,
  githubCallbackQuerySchema,
} from '../modules/oauth/schemas'
import { createGitHubAuthorizeRedirect, exchangeOAuthCode, handleGitHubCallback } from '../lib/github-oauth'
import { loginUser, refreshAccessToken } from '../lib/auth'
import type { AppRouteDefinition } from './utils'

export const authRoutes: AppRouteDefinition[] = [
  {
    method: 'POST',
    matchPath: '/api/v1/user/login',
    jsonSchema: loginBodySchema,
    responseSchema: loginResponseSchema,
    handler: async ({ body, json, audit }) => {
      const payload = body as typeof loginBodySchema._output
      try {
        const data = await loginUser(payload.username, payload.password)
        audit({
          action: 'auth.login',
          targetType: 'user',
          targetId: data.user.id,
          metadata: { username: payload.username },
        })
        return json(data)
      }
      catch (error) {
        audit({
          action: 'auth.login',
          status: 'failure',
          metadata: { username: payload.username },
        })
        throw error
      }
    },
  },
  {
    method: 'POST',
    matchPath: '/api/v1/auth/refresh',
    jsonSchema: refreshTokenBodySchema,
    responseSchema: refreshTokenResponseSchema,
    handler: async ({ body, json, audit }) => {
      const payload = body as typeof refreshTokenBodySchema._output
      const data = refreshAccessToken(payload.refreshToken)
      audit({
        action: 'auth.refresh_token',
      })
      return json({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresAt: data.accessExpiresAt,
      })
    },
  },
  {
    method: 'GET',
    matchPath: '/api/v1/auth/github',
    querySchema: githubAuthorizeQuerySchema,
    handler: async ({ url }) => createGitHubAuthorizeRedirect(url),
  },
  {
    method: 'GET',
    matchPath: '/api/v1/auth/github/callback',
    querySchema: githubCallbackQuerySchema,
    handler: async ({ url }) => await handleGitHubCallback(url),
  },
  {
    method: 'POST',
    matchPath: '/api/v1/auth/exchange',
    jsonSchema: exchangeOAuthCodeBodySchema,
    responseSchema: exchangeOAuthCodeResponseSchema,
    handler: async ({ body, json, audit }) => {
      const payload = body as typeof exchangeOAuthCodeBodySchema._output
      const data = exchangeOAuthCode(payload.code)
      audit({
        action: 'auth.oauth_exchange',
        targetType: 'user',
        targetId: data.user.id,
      })
      return json(data)
    },
  },
]
