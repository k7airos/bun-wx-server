import { z } from 'zod'
import { badRequest } from './lib/errors'
import { dirnamePath, resolvePath } from './lib/path'
import { parseWithSchema } from './lib/validation'

const rootDir = process.cwd()
const defaultJwtSecret = 'dev-insecure-local-secret'

function positiveIntEnv(name: string, fallback: number) {
  return z.union([z.string(), z.number(), z.undefined()]).transform((value, ctx) => {
    const candidate = value === undefined || value === '' ? fallback : Number(value)
    if (!Number.isFinite(candidate) || candidate <= 0 || !Number.isInteger(candidate)) {
      ctx.addIssue({
        code: 'custom',
        message: `${name} 必须是正整数`,
      })
      return z.NEVER
    }
    return candidate
  })
}

function trimmedStringEnv() {
  return z.union([z.string(), z.undefined()]).transform(value => (value || '').trim())
}

const envSchema = z.object({
  NODE_ENV: z.union([z.string(), z.undefined()]).transform(value => (value || 'development').trim().toLowerCase()),
  PORT: positiveIntEnv('PORT', 3001),
  DATABASE_PATH: z.union([z.string(), z.undefined()]).transform(value => value || '.data/app.sqlite'),
  LOG_LEVEL: z.union([z.string(), z.undefined()]).transform((value, ctx) => {
    const candidate = (value || 'info').trim().toLowerCase()
    if (!['info', 'warn', 'error'].includes(candidate)) {
      ctx.addIssue({
        code: 'custom',
        message: 'LOG_LEVEL 必须是 info/warn/error 之一',
      })
      return z.NEVER
    }
    return candidate as 'info' | 'warn' | 'error'
  }),
  AUDIT_RETENTION_DAYS: positiveIntEnv('AUDIT_RETENTION_DAYS', 90),
  JWT_SECRET: trimmedStringEnv(),
  JWT_EXPIRES_IN_SECONDS: positiveIntEnv('JWT_EXPIRES_IN_SECONDS', 15 * 60),
  REFRESH_TOKEN_EXPIRES_IN_SECONDS: positiveIntEnv('REFRESH_TOKEN_EXPIRES_IN_SECONDS', 7 * 24 * 60 * 60),
  APP_ALLOWED_SOURCES: z.union([z.string(), z.undefined()]).transform((value) => {
    const raw = value || 'zotepad,zotepad-desktop'
    return raw
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
  }),
  COS_SECRET_ID: z.union([z.string(), z.undefined()]).transform(value => value || ''),
  COS_SECRET_KEY: z.union([z.string(), z.undefined()]).transform(value => value || ''),
  COS_BUCKET: z.union([z.string(), z.undefined()]).transform(value => value || ''),
  COS_REGION: z.union([z.string(), z.undefined()]).transform(value => value || 'ap-guangzhou'),
  COS_STS_DURATION_SECONDS: positiveIntEnv('COS_STS_DURATION_SECONDS', 1800),
  WX_REQUEST_TIMEOUT_MS: positiveIntEnv('WX_REQUEST_TIMEOUT_MS', 30000),
  GITHUB_CLIENT_ID: trimmedStringEnv(),
  GITHUB_CLIENT_SECRET: trimmedStringEnv(),
  GITHUB_CALLBACK_URL: trimmedStringEnv(),
  OAUTH_FRONTEND_CALLBACK_URL: trimmedStringEnv(),
  OAUTH_STATE_EXPIRES_IN_SECONDS: positiveIntEnv('OAUTH_STATE_EXPIRES_IN_SECONDS', 10 * 60),
  OAUTH_EXCHANGE_CODE_EXPIRES_IN_SECONDS: positiveIntEnv('OAUTH_EXCHANGE_CODE_EXPIRES_IN_SECONDS', 60),
})

const env = parseWithSchema(envSchema, process.env, '环境变量配置不合法')
const databasePath = resolvePath(rootDir, env.DATABASE_PATH)
const rawJwtSecret = env.JWT_SECRET

export const config = {
  rootDir,
  nodeEnv: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  port: env.PORT,
  databasePath,
  databaseDir: dirnamePath(databasePath),
  logLevel: env.LOG_LEVEL,
  auditRetentionDays: env.AUDIT_RETENTION_DAYS,
  jwtSecret: rawJwtSecret || defaultJwtSecret,
  isUsingDefaultJwtSecret: !rawJwtSecret,
  jwtExpiresInSeconds: env.JWT_EXPIRES_IN_SECONDS,
  refreshTokenExpiresInSeconds: env.REFRESH_TOKEN_EXPIRES_IN_SECONDS,
  allowedSources: env.APP_ALLOWED_SOURCES,
  cosSecretId: env.COS_SECRET_ID,
  cosSecretKey: env.COS_SECRET_KEY,
  cosBucket: env.COS_BUCKET,
  cosRegion: env.COS_REGION,
  cosStsDurationSeconds: env.COS_STS_DURATION_SECONDS,
  wxRequestTimeoutMs: env.WX_REQUEST_TIMEOUT_MS,
  githubClientId: env.GITHUB_CLIENT_ID,
  githubClientSecret: env.GITHUB_CLIENT_SECRET,
  githubCallbackUrl: env.GITHUB_CALLBACK_URL,
  oauthFrontendCallbackUrl: env.OAUTH_FRONTEND_CALLBACK_URL,
  oauthStateExpiresInSeconds: env.OAUTH_STATE_EXPIRES_IN_SECONDS,
  oauthExchangeCodeExpiresInSeconds: env.OAUTH_EXCHANGE_CODE_EXPIRES_IN_SECONDS,
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
  if (config.auditRetentionDays < 7) {
    warnings.push('AUDIT_RETENTION_DAYS 小于 7 天，审计日志可能过早清理')
  }
  return warnings
}

export function assertCosConfig() {
  if (!config.cosSecretId || !config.cosSecretKey || !config.cosBucket || !config.cosRegion) {
    throw badRequest('COS 配置不完整，请检查 COS_SECRET_ID/COS_SECRET_KEY/COS_BUCKET/COS_REGION')
  }
}

export function assertGitHubOAuthConfig() {
  if (!config.githubClientId || !config.githubClientSecret || !config.githubCallbackUrl || !config.oauthFrontendCallbackUrl) {
    throw badRequest('GitHub OAuth 配置不完整，请检查 GITHUB_CLIENT_ID/GITHUB_CLIENT_SECRET/GITHUB_CALLBACK_URL/OAUTH_FRONTEND_CALLBACK_URL')
  }
}
