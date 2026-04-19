import { config, assertGitHubOAuthConfig } from '../config'
import { createOAuthAuthorizeRedirect, exchangeOAuthCode, handleOAuthCallback } from './oauth-core'
import { githubOAuthProvider } from './oauth-providers/github'

export function createGitHubAuthorizeRedirect(requestUrl: URL) {
  assertGitHubOAuthConfig()
  return createOAuthAuthorizeRedirect(githubOAuthProvider, {
    requestUrl,
    stateExpiresInSeconds: config.oauthStateExpiresInSeconds,
  })
}

export async function handleGitHubCallback(requestUrl: URL) {
  assertGitHubOAuthConfig()
  return await handleOAuthCallback(githubOAuthProvider, {
    requestUrl,
    frontendCallbackUrl: config.oauthFrontendCallbackUrl,
    exchangeCodeExpiresInSeconds: config.oauthExchangeCodeExpiresInSeconds,
  })
}

export { exchangeOAuthCode }
