import { db } from '../../../db'
import type { PersonalAccessTokenRow, RefreshTokenRow } from '../types'

const insertRefreshTokenStmt = db.prepare(`
  INSERT INTO refresh_tokens (id, user_id, token_hash, scope, expires_at)
  VALUES (?, ?, ?, ?, ?)
`)

const revokeRefreshTokenStmt = db.prepare(`
  UPDATE refresh_tokens
  SET is_revoked = 1
  WHERE token_hash = ?
`)

const findRefreshTokenStmt = db.query<RefreshTokenRow, [string]>(`
  SELECT id, user_id, token_hash, scope, is_revoked, expires_at
  FROM refresh_tokens
  WHERE token_hash = ?
  LIMIT 1
`)

const insertPatStmt = db.prepare(`
  INSERT INTO personal_access_tokens (id, user_id, token_hash, note, scope, expires_at)
  VALUES (?, ?, ?, ?, ?, ?)
`)

const findPatStmt = db.query<PersonalAccessTokenRow, [string]>(`
  SELECT id, user_id, note, scope, created_at, is_revoked, expires_at
  FROM personal_access_tokens
  WHERE token_hash = ?
  LIMIT 1
`)

const listPatStmt = db.query<PersonalAccessTokenRow, [string]>(`
  SELECT id, note, scope, created_at, expires_at, is_revoked
  FROM personal_access_tokens
  WHERE user_id = ?
  ORDER BY created_at DESC
`)

const revokePatStmt = db.prepare(`
  UPDATE personal_access_tokens
  SET is_revoked = 1, updated_at = CURRENT_TIMESTAMP
  WHERE id = ? AND user_id = ?
`)

export function insertRefreshToken(input: {
  id: string
  userId: string
  tokenHash: string
  scope: string
  expiresAt: string
}) {
  insertRefreshTokenStmt.run(input.id, input.userId, input.tokenHash, input.scope, input.expiresAt)
}

export function revokeRefreshTokenByHash(tokenHash: string) {
  revokeRefreshTokenStmt.run(tokenHash)
}

export function findRefreshTokenByHash(tokenHash: string) {
  return findRefreshTokenStmt.get(tokenHash) || null
}

export function insertPersonalAccessToken(input: {
  id: string
  userId: string
  tokenHash: string
  note: string
  scope: string
  expiresAt: string
}) {
  insertPatStmt.run(input.id, input.userId, input.tokenHash, input.note, input.scope, input.expiresAt)
}

export function findPersonalAccessTokenByHash(tokenHash: string) {
  return findPatStmt.get(tokenHash) || null
}

export function listPersonalAccessTokensByUserId(userId: string) {
  return listPatStmt.all(userId)
}

export function revokePersonalAccessToken(userId: string, tokenId: string) {
  revokePatStmt.run(tokenId, userId)
}
