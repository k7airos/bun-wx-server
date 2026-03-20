import { createHash, randomBytes } from 'node:crypto'

export function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

export function randomId(size = 16) {
  return randomBytes(size).toString('hex')
}

export function randomToken(prefix = '', size = 32) {
  return `${prefix}${randomBytes(size).toString('base64url')}`
}

export function unixNow() {
  return Math.floor(Date.now() / 1000)
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function lowerFirstLetter(value: string) {
  return value.charAt(0).toLowerCase() + value.slice(1)
}

export function camelizeKeys(input: any): any {
  if (Array.isArray(input)) {
    return input.map(camelizeKeys)
  }
  if (input && typeof input === 'object') {
    return Object.fromEntries(
      Object.entries(input).map(([key, value]) => {
        if (key === 'Token') {
          return ['sessionToken', value]
        }
        return [lowerFirstLetter(key), camelizeKeys(value)]
      }),
    )
  }
  return input
}
