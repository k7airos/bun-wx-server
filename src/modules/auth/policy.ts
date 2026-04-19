import { API_CODES } from '../../lib/api-codes'
import { forbidden } from '../../lib/errors'

export const PAT_SCOPES = {
  all: { label: '全部权限', paths: ['/api/v1/'] },
  wx: { label: '微信接口', paths: ['/api/v1/wx/'] },
  upload: { label: '文件上传', paths: ['/api/v1/upload/'] },
  user: { label: '用户信息', paths: ['/api/v1/user/'] },
} as const

export type PatScopeKey = keyof typeof PAT_SCOPES

export function parseScope(scope: string): { scopes: string[], note: string } {
  const newFormatMatch = scope.match(/^scopes:([^|]+)\|note:(.+)$/)
  if (newFormatMatch) {
    return {
      scopes: newFormatMatch[1].split(','),
      note: newFormatMatch[2],
    }
  }

  const oldFormatMatch = scope.match(/^pat:(.+)$/)
  if (oldFormatMatch) {
    return {
      scopes: ['all'],
      note: oldFormatMatch[1],
    }
  }

  return { scopes: ['all'], note: scope }
}

export function isPathAllowedByScope(scope: string, pathname: string) {
  if (scope === 'all') {
    return true
  }

  const simpleScope = PAT_SCOPES[scope as PatScopeKey]
  if (simpleScope) {
    return simpleScope.paths.some(item => pathname.startsWith(item))
  }

  const scopeMatch = scope.match(/^scopes:([^|]+)/)
  if (!scopeMatch) {
    return false
  }

  const scopeKeys = scopeMatch[1].split(',') as PatScopeKey[]
  if (scopeKeys.includes('all')) {
    return true
  }

  return scopeKeys.some((scopeKey) => {
    const entry = PAT_SCOPES[scopeKey]
    return entry?.paths.some(path => pathname.startsWith(path))
  })
}

export function requireSuperAdmin(role: string) {
  if (role !== 'superAdmin') {
    throw forbidden('无权限访问', API_CODES.PERMISSION_DENIED)
  }
}
