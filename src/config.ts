import { dirname, resolve } from 'node:path'
import { badRequest } from './lib/errors'

const rootDir = process.cwd()
const rawNodeEnv = (process.env.NODE_ENV || 'development').trim().toLowerCase()
const defaultJwtSecret = 'dev-insecure-local-secret'

function readPositiveNumber(name: string, fallback: number) {
  const raw = process.env[name]
  const value = raw ? Number(raw) : fallback
  if (!Number.isFinite(value) || value <= 0) {
    throw badRequest(`${name} 必须是正整数`)
  }
  return value
}

const databasePath = resolve(rootDir, process.env.DATABASE_PATH || '.data/app.sqlite')
const rawJwtSecret = (process.env.JWT_SECRET || '').trim()

export const config = {
  rootDir,
  nodeEnv: rawNodeEnv,
  isProduction: rawNodeEnv === 'production',
  port: readPositiveNumber('PORT', 3001),
  databasePath,
  databaseDir: dirname(databasePath),
  jwtSecret: rawJwtSecret || defaultJwtSecret,
  isUsingDefaultJwtSecret: !rawJwtSecret,
  jwtExpiresInSeconds: readPositiveNumber('JWT_EXPIRES_IN_SECONDS', 15 * 60),
  refreshTokenExpiresInSeconds: readPositiveNumber('REFRESH_TOKEN_EXPIRES_IN_SECONDS', 7 * 24 * 60 * 60),
  allowedSources: (process.env.APP_ALLOWED_SOURCES || 'zotepad,zotepad-desktop')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean),
  cosSecretId: process.env.COS_SECRET_ID || '',
  cosSecretKey: process.env.COS_SECRET_KEY || '',
  cosBucket: process.env.COS_BUCKET || '',
  cosRegion: process.env.COS_REGION || 'ap-guangzhou',
  cosStsDurationSeconds: readPositiveNumber('COS_STS_DURATION_SECONDS', 1800),
  wxRequestTimeoutMs: readPositiveNumber('WX_REQUEST_TIMEOUT_MS', 30000),
}

export type ConfigValidationMode = 'serve' | 'maintenance'

export function assertRuntimeConfig(mode: ConfigValidationMode = 'serve') {
  if (mode === 'serve' && config.isProduction && config.isUsingDefaultJwtSecret) {
    throw badRequest('生产环境必须显式配置 JWT_SECRET，不能使用默认开发密钥')
  }
}

export function getConfigWarnings(mode: ConfigValidationMode = 'serve') {
  const warnings: string[] = []
  if (mode === 'serve' && !config.isProduction && config.isUsingDefaultJwtSecret) {
    warnings.push('当前使用默认开发 JWT_SECRET，仅适合本地开发')
  }
  if (mode === 'serve' && !config.allowedSources.length) {
    warnings.push('APP_ALLOWED_SOURCES 为空，将不限制 X-App-Source')
  }
  return warnings
}

export function assertCosConfig() {
  if (!config.cosSecretId || !config.cosSecretKey || !config.cosBucket || !config.cosRegion) {
    throw badRequest('COS 配置不完整，请检查 COS_SECRET_ID/COS_SECRET_KEY/COS_BUCKET/COS_REGION')
  }
}
