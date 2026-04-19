import { db } from '../../../db'
import type { UserRow } from '../types'

const getUserByUsernameStmt = db.query<UserRow, [string]>(`
  SELECT id, username, nickname, email, avatar_url, website, password_hash, role, status
  FROM users
  WHERE username = ?
  LIMIT 1
`)

const getUserByIdStmt = db.query<UserRow, [string]>(`
  SELECT id, username, nickname, email, avatar_url, website, password_hash, role, status
  FROM users
  WHERE id = ?
  LIMIT 1
`)

const countUsersStmt = db.query<{ total: number }, []>('SELECT COUNT(*) as total FROM users')

const listUsersStmt = db.query<UserRow, []>(`
  SELECT id, username, nickname, email, avatar_url, website, password_hash, role, status
  FROM users
  ORDER BY id DESC
`)

const findUserByNicknameStmt = db.query<{ id: string }, [string, string]>(`
  SELECT id
  FROM users
  WHERE nickname = ? AND id != ?
  LIMIT 1
`)

const findUserByUsernameStmt = db.query<{ id: string }, [string, string]>(`
  SELECT id
  FROM users
  WHERE username = ? AND id != ?
  LIMIT 1
`)

const insertUserStmt = db.prepare(`
  INSERT INTO users (id, username, nickname, password_hash, role)
  VALUES (?, ?, ?, ?, ?)
`)

const updateUserStmt = db.prepare(`
  UPDATE users
  SET email = COALESCE(?, email),
      nickname = COALESCE(?, nickname),
      username = COALESCE(?, username),
      password_hash = COALESCE(?, password_hash),
      website = COALESCE(?, website),
      avatar_url = COALESCE(?, avatar_url),
      updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
`)

export function getUserByUsername(username: string) {
  return getUserByUsernameStmt.get(username) || null
}

export function getUserById(userId: string) {
  return getUserByIdStmt.get(userId) || null
}

export function countUsers() {
  return Number(countUsersStmt.get()?.total || 0)
}

export function listUserRows() {
  return listUsersStmt.all()
}

export function findUserByNicknameExcludingId(nickname: string, userId: string) {
  return findUserByNicknameStmt.get(nickname, userId) || null
}

export function findUserByUsernameExcludingId(username: string, userId: string) {
  return findUserByUsernameStmt.get(username, userId) || null
}

export function insertUser(input: {
  id: string
  username: string
  nickname: string
  passwordHash: string
  role: string
}) {
  insertUserStmt.run(input.id, input.username, input.nickname, input.passwordHash, input.role)
}

export function updateUserRecord(userId: string, input: {
  email?: string | null
  nickname?: string | null
  username?: string | null
  passwordHash?: string | null
  website?: string | null
  avatarUrl?: string | null
}) {
  updateUserStmt.run(
    input.email ?? null,
    input.nickname ?? null,
    input.username ?? null,
    input.passwordHash ?? null,
    input.website ?? null,
    input.avatarUrl ?? null,
    userId,
  )
}
