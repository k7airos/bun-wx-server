import { db } from '../../db'
import type { ExchangeCodeRow, OAuthStateRow } from './types'

const findOAuthAccountStmt = db.query<{
  id: string
  user_id: string
}, [string, string]>(`
  SELECT id, user_id
  FROM oauth_accounts
  WHERE provider = ? AND provider_user_id = ?
  LIMIT 1
`)

const findUserByEmailStmt = db.query<{ id: string }, [string]>(`
  SELECT id
  FROM users
  WHERE email = ?
  LIMIT 1
`)

const findUserByUsernameStmt = db.query<{ id: string }, [string]>(`
  SELECT id
  FROM users
  WHERE username = ?
  LIMIT 1
`)

const insertOAuthAccountStmt = db.prepare(`
  INSERT INTO oauth_accounts (
    id, provider, provider_user_id, user_id, provider_login, provider_email, provider_avatar, access_token
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`)

const updateOAuthAccountStmt = db.prepare(`
  UPDATE oauth_accounts
  SET user_id = ?,
      provider_login = ?,
      provider_email = ?,
      provider_avatar = ?,
      access_token = ?,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`)

const insertOAuthStateStmt = db.prepare(`
  INSERT INTO oauth_login_states (id, provider, state, redirect_path, expires_at)
  VALUES (?, ?, ?, ?, ?)
`)

const findOAuthStateStmt = db.query<OAuthStateRow, [string, string]>(`
  SELECT id, redirect_path, expires_at
  FROM oauth_login_states
  WHERE provider = ? AND state = ?
  LIMIT 1
`)

const deleteOAuthStateStmt = db.prepare(`
  DELETE FROM oauth_login_states
  WHERE id = ?
`)

const insertExchangeCodeStmt = db.prepare(`
  INSERT INTO oauth_exchange_codes (id, user_id, code, redirect_path, expires_at)
  VALUES (?, ?, ?, ?, ?)
`)

const findExchangeCodeStmt = db.query<ExchangeCodeRow, [string]>(`
  SELECT id, user_id, is_used, expires_at
  FROM oauth_exchange_codes
  WHERE code = ?
  LIMIT 1
`)

const markExchangeCodeUsedStmt = db.prepare(`
  UPDATE oauth_exchange_codes
  SET is_used = 1
  WHERE id = ?
`)

const insertUserStmt = db.prepare(`
  INSERT INTO users (id, username, nickname, email, avatar_url, password_hash, role, status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`)

export function findOAuthAccount(provider: string, providerUserId: string) {
  return findOAuthAccountStmt.get(provider, providerUserId) || null
}

export function findUserIdByEmail(email: string) {
  return findUserByEmailStmt.get(email)?.id || null
}

export function findUserIdByUsername(username: string) {
  return findUserByUsernameStmt.get(username)?.id || null
}

export function insertOAuthAccount(input: {
  id: string
  provider: string
  providerUserId: string
  userId: string
  login: string | null
  email: string | null
  avatarUrl: string | null
  accessToken: string | null
}) {
  insertOAuthAccountStmt.run(
    input.id,
    input.provider,
    input.providerUserId,
    input.userId,
    input.login,
    input.email,
    input.avatarUrl,
    input.accessToken,
  )
}

export function updateOAuthAccount(input: {
  id: string
  userId: string
  login: string | null
  email: string | null
  avatarUrl: string | null
  accessToken: string | null
}) {
  updateOAuthAccountStmt.run(
    input.userId,
    input.login,
    input.email,
    input.avatarUrl,
    input.accessToken,
    input.id,
  )
}

export function insertOAuthState(input: {
  id: string
  provider: string
  state: string
  redirectPath: string
  expiresAt: string
}) {
  insertOAuthStateStmt.run(input.id, input.provider, input.state, input.redirectPath, input.expiresAt)
}

export function findOAuthState(provider: string, state: string) {
  return findOAuthStateStmt.get(provider, state) || null
}

export function deleteOAuthState(id: string) {
  deleteOAuthStateStmt.run(id)
}

export function insertExchangeCode(input: {
  id: string
  userId: string
  code: string
  redirectPath: string
  expiresAt: string
}) {
  insertExchangeCodeStmt.run(input.id, input.userId, input.code, input.redirectPath, input.expiresAt)
}

export function findExchangeCode(code: string) {
  return findExchangeCodeStmt.get(code) || null
}

export function markExchangeCodeUsed(id: string) {
  markExchangeCodeUsedStmt.run(id)
}

export function insertOAuthUser(input: {
  id: string
  username: string
  nickname: string
  email: string | null
  avatarUrl: string | null
  passwordHash: string
}) {
  insertUserStmt.run(
    input.id,
    input.username,
    input.nickname,
    input.email,
    input.avatarUrl,
    input.passwordHash,
    'user',
    1,
  )
}
