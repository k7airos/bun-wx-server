import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { Database } from 'bun:sqlite'
import { config } from './config'
import { badRequest } from './lib/errors'

mkdirSync(config.databaseDir, { recursive: true })

export const db = new Database(config.databasePath, { create: true })

const migrations = [
  {
    id: '001_initial_schema',
    up() {
      db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        nickname TEXT,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        status INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS personal_access_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        note TEXT NOT NULL,
        scope TEXT NOT NULL DEFAULT 'all',
        status INTEGER NOT NULL DEFAULT 1,
        is_revoked INTEGER NOT NULL DEFAULT 0,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        scope TEXT NOT NULL DEFAULT 'all',
        is_revoked INTEGER NOT NULL DEFAULT 0,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE INDEX IF NOT EXISTS idx_pat_user_id ON personal_access_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_refresh_user_id ON refresh_tokens(user_id);
      `)
    },
  },
]

let initialized = false

function ensureMigrationsTable() {
  db.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  `)
}

export function runMigrations() {
  ensureMigrationsTable()

  const appliedRows = db.prepare('SELECT id FROM schema_migrations ORDER BY id ASC').all() as Array<{ id: string }>
  const applied = new Set(appliedRows.map(row => row.id))

  for (const migration of migrations) {
    if (applied.has(migration.id)) {
      continue
    }

    db.transaction(() => {
      migration.up()
      db.prepare('INSERT INTO schema_migrations (id) VALUES (?)').run(migration.id)
    })()
  }
}

export function initializeDatabase() {
  if (initialized) {
    return
  }

  runMigrations()
  initialized = true
}

export function closeDatabase() {
  db.close(false)
}

export function backupDatabase(outputPath: string) {
  initializeDatabase()

  const resolvedPath = resolve(process.cwd(), outputPath)
  if (resolvedPath === config.databasePath) {
    throw badRequest('备份路径不能与主数据库路径相同')
  }

  mkdirSync(dirname(resolvedPath), { recursive: true })
  closeDatabase()
  copyFileSync(config.databasePath, resolvedPath)
  return resolvedPath
}

export function restoreDatabase(inputPath: string) {
  const resolvedPath = resolve(process.cwd(), inputPath)
  if (!existsSync(resolvedPath)) {
    throw badRequest(`备份文件不存在: ${resolvedPath}`)
  }

  mkdirSync(config.databaseDir, { recursive: true })
  closeDatabase()
  copyFileSync(resolvedPath, config.databasePath)
  return config.databasePath
}

initializeDatabase()
