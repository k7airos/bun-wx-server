import { Database } from 'bun:sqlite'
import { config } from './config'
import { copyFileSync, ensureDirSync, existsSync } from './lib/bun-fs'
import { badRequest } from './lib/errors'
import { dirnamePath, resolvePath } from './lib/path'

ensureDirSync(config.databaseDir)

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
  {
    id: '002_user_profile_and_pat_note',
    up() {
      db.exec(`
      ALTER TABLE users ADD COLUMN email TEXT;
      `)
    },
  },
  {
    id: '003_user_avatar_and_website',
    up() {
      db.exec(`
      ALTER TABLE users ADD COLUMN avatar_url TEXT;
      `)
    },
  },
  {
    id: '004_user_website',
    up() {
      db.exec(`
      ALTER TABLE users ADD COLUMN website TEXT;
      `)
    },
  },
  {
    id: '005_oauth_tables',
    up() {
      db.exec(`
      CREATE TABLE IF NOT EXISTS oauth_accounts (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        provider_user_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        provider_login TEXT,
        provider_email TEXT,
        provider_avatar TEXT,
        access_token TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(provider, provider_user_id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS oauth_login_states (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        state TEXT NOT NULL UNIQUE,
        redirect_path TEXT,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS oauth_exchange_codes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        code TEXT NOT NULL UNIQUE,
        redirect_path TEXT,
        is_used INTEGER NOT NULL DEFAULT 0,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user_id ON oauth_accounts(user_id);
      CREATE INDEX IF NOT EXISTS idx_oauth_states_provider ON oauth_login_states(provider);
      CREATE INDEX IF NOT EXISTS idx_oauth_exchange_codes_user_id ON oauth_exchange_codes(user_id);
      `)
    },
  },
  {
    id: '006_audit_logs',
    up() {
      db.exec(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        request_id TEXT,
        action TEXT NOT NULL,
        actor_user_id TEXT,
        actor_role TEXT,
        status TEXT NOT NULL DEFAULT 'success',
        target_type TEXT,
        target_id TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id ON audit_logs(request_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_user_id ON audit_logs(actor_user_id);
      `)
    },
  },
  {
    id: '007_wx_idempotency_keys',
    up() {
      db.exec(`
      CREATE TABLE IF NOT EXISTS wx_idempotency_keys (
        id TEXT PRIMARY KEY,
        scope_key TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        operation TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        request_fingerprint TEXT NOT NULL,
        response_json TEXT,
        claimed_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TEXT NOT NULL,
        UNIQUE(scope_key, idempotency_key)
      );

      CREATE INDEX IF NOT EXISTS idx_wx_idempotency_keys_expires_at ON wx_idempotency_keys(expires_at);
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

  const resolvedPath = resolvePath(process.cwd(), outputPath)
  if (resolvedPath === config.databasePath) {
    throw badRequest('备份路径不能与主数据库路径相同')
  }

  ensureDirSync(dirnamePath(resolvedPath))
  closeDatabase()
  copyFileSync(config.databasePath, resolvedPath)
  return resolvedPath
}

export function restoreDatabase(inputPath: string) {
  const resolvedPath = resolvePath(process.cwd(), inputPath)
  if (!existsSync(resolvedPath)) {
    throw badRequest(`备份文件不存在: ${resolvedPath}`)
  }

  ensureDirSync(config.databaseDir)
  closeDatabase()
  copyFileSync(resolvedPath, config.databasePath)
  return config.databasePath
}

initializeDatabase()
