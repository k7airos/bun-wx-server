export type UserRow = {
  id: string
  username: string
  nickname: string | null
  email: string | null
  avatar_url: string | null
  website: string | null
  password_hash: string
  role: string
  status: number
}

export type SerializedUser = {
  id: string
  username: string
  nickname: string | null
  email: string | null
  role: string
  avatarUrl: string | null
  website: string | null
  status: number
}

export type RefreshTokenRow = {
  id: string
  user_id: string
  token_hash: string
  scope: string
  is_revoked: number
  expires_at: string
}

export type PersonalAccessTokenRow = {
  id: string
  user_id: string
  note: string
  scope: string
  created_at: string
  is_revoked: number
  expires_at: string
}

export type AuthContext = {
  userId: string
  role: string
  scope: string
  tokenType: 'jwt' | 'pat'
  user: SerializedUser
}
