import { ApiError } from './errors'
import { API_CODES } from './api-codes'

function withRequestId(init: ResponseInit, requestId?: string) {
  const headers = new Headers(init.headers || {})
  if (requestId) {
    headers.set('x-request-id', requestId)
  }
  return {
    ...init,
    headers,
  }
}

export function jsonSuccess(data: unknown, init: ResponseInit = {}, requestId?: string) {
  return Response.json({
    code: API_CODES.SUCCESS,
    message: 'ok',
    data,
    timestamp: Date.now(),
  }, withRequestId(init, requestId))
}

export function jsonError(error: unknown, requestId?: string) {
  if (error instanceof ApiError) {
    return Response.json({
      code: error.code,
      message: error.message,
      data: error.details,
      timestamp: Date.now(),
    }, withRequestId({ status: error.status }, requestId))
  }

  console.error('[Unhandled Error]', error)
  return Response.json({
    code: API_CODES.INTERNAL_ERROR,
    message: '出错啦，请稍后再试',
    data: null,
    timestamp: Date.now(),
  }, withRequestId({ status: 500 }, requestId))
}
