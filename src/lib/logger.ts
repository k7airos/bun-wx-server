import { config } from '../config'

export type LogLevel = 'info' | 'warn' | 'error'

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  info: 10,
  warn: 20,
  error: 30,
}

const SENSITIVE_KEY_PATTERN = /(password|authorization|secret|token|cookie|session|apikey|api_key|refresh)/i
const REDACTED_VALUE = '[REDACTED]'

function shouldWrite(level: LogLevel) {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[config.logLevel]
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => redactValue(item))
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        return [key, REDACTED_VALUE]
      }
      return [key, redactValue(entryValue)]
    }),
  )
}

function serializeError(error: unknown) {
  if (!(error instanceof Error)) {
    return error
  }

  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  }
}

export function sanitizeLogPayload(payload: Record<string, unknown>) {
  return redactValue(payload) as Record<string, unknown>
}

function write(level: LogLevel, event: string, payload: Record<string, unknown>) {
  if (!shouldWrite(level)) {
    return
  }

  const sanitizedPayload = sanitizeLogPayload({
    ...payload,
    error: serializeError(payload.error),
  })

  const entry = JSON.stringify({
    level,
    event,
    timestamp: new Date().toISOString(),
    ...sanitizedPayload,
  })

  if (level === 'error') {
    console.error(entry)
    return
  }
  if (level === 'warn') {
    console.warn(entry)
    return
  }
  console.info(entry)
}

export function logInfo(event: string, payload: Record<string, unknown>) {
  write('info', event, payload)
}

export function logWarn(event: string, payload: Record<string, unknown>) {
  write('warn', event, payload)
}

export function logError(event: string, payload: Record<string, unknown>) {
  write('error', event, payload)
}
