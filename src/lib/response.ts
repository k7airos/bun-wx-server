import { ApiError } from './errors'
import { API_CODES } from './api-codes'

export function jsonSuccess(data: unknown, init: ResponseInit = {}) {
  return Response.json({
    code: API_CODES.SUCCESS,
    message: 'ok',
    data,
    timestamp: Date.now(),
  }, init)
}

export function jsonError(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json({
      code: error.code,
      message: error.message,
      data: error.details,
      timestamp: Date.now(),
    }, { status: error.status })
  }

  console.error('[Unhandled Error]', error)
  return Response.json({
    code: API_CODES.INTERNAL_ERROR,
    message: '出错啦，请稍后再试',
    data: null,
    timestamp: Date.now(),
  }, { status: 500 })
}
