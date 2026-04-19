export interface OAuthNormalizedUser {
  providerUserId: string
  login: string | null
  email: string | null
  avatarUrl: string | null
  accessToken?: string | null
}

export interface OAuthProviderAdapter {
  name: string
  buildAuthorizeUrl(input: { state: string }): URL
  exchangeCode(code: string): Promise<string>
  fetchNormalizedUser(accessToken: string): Promise<OAuthNormalizedUser>
}

export type OAuthStateRow = {
  id: string
  redirect_path: string | null
  expires_at: string
}

export type ExchangeCodeRow = {
  id: string
  user_id: string
  is_used: number
  expires_at: string
}
