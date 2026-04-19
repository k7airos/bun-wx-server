export function sha256(value: string) {
  const hasher = new Bun.CryptoHasher('sha256')
  hasher.update(value)
  return hasher.digest('hex')
}

export function randomId(size = 16) {
  const bytes = crypto.getRandomValues(new Uint8Array(size))
  return Buffer.from(bytes).toString('hex')
}

export function randomToken(prefix = '', size = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(size))
  return `${prefix}${Buffer.from(bytes).toString('base64url')}`
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

export function constantTimeEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left)
  const rightBytes = Buffer.from(right)
  if (leftBytes.length !== rightBytes.length) {
    return false
  }

  let diff = 0
  for (let index = 0; index < leftBytes.length; index += 1) {
    diff |= leftBytes[index] ^ rightBytes[index]
  }
  return diff === 0
}
