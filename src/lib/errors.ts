import { API_CODES, type ApiCode } from './api-codes'

export class ApiError extends Error {
  status: number
  code: ApiCode
  details: unknown

  constructor(status: number, code: ApiCode, message: string, details: unknown = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export function badRequest(message: string, details: unknown = null) {
  return new ApiError(400, API_CODES.VALIDATION_ERROR, message, details)
}

export function unauthorized(message = '请先登录', code: ApiCode = API_CODES.NO_TOKEN) {
  return new ApiError(401, code, message)
}

export function forbidden(message = '无权限访问', code: ApiCode = API_CODES.FORBIDDEN) {
  return new ApiError(403, code, message)
}

export function internalError(message = '服务器内部错误', details: unknown = null) {
  return new ApiError(500, API_CODES.INTERNAL_ERROR, message, details)
}
