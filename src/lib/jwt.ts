import { config } from '../config'
import { constantTimeEqual, unixNow } from './utils'

interface JwtPayload {
  userId: string
  scope: string
  iat?: number
  exp?: number
}

function base64urlEncode(input: string | Buffer) {
  return Buffer.from(input).toString('base64url')
}

function base64urlDecode(input: string) {
  return Buffer.from(input, 'base64url').toString('utf8')
}

function signSegment(segment: string) {
  const hasher = new Bun.CryptoHasher('sha256', config.jwtSecret)
  hasher.update(segment)
  return hasher.digest('base64url')
}

export function signJwt(payload: Omit<JwtPayload, 'iat' | 'exp'>, expiresInSeconds = config.jwtExpiresInSeconds) {
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = unixNow()
  const fullPayload: JwtPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  }

  const encodedHeader = base64urlEncode(JSON.stringify(header))
  const encodedPayload = base64urlEncode(JSON.stringify(fullPayload))
  const signingInput = `${encodedHeader}.${encodedPayload}`
  const signature = signSegment(signingInput)
  return `${signingInput}.${signature}`
}

export function verifyJwt(token: string): { isAuth: boolean, payload?: JwtPayload, error?: string } {
  const parts = token.split('.')
  if (parts.length !== 3) {
    return { isAuth: false, error: 'invalid-token-format' }
  }

  const [encodedHeader, encodedPayload, signature] = parts
  const signingInput = `${encodedHeader}.${encodedPayload}`
  const expectedSignature = signSegment(signingInput)

  if (!constantTimeEqual(signature, expectedSignature)) {
    return { isAuth: false, error: 'invalid-signature' }
  }

  try {
    const payload = JSON.parse(base64urlDecode(encodedPayload)) as JwtPayload
    if (!payload.exp || payload.exp <= unixNow()) {
      return { isAuth: false, error: 'expired' }
    }
    return { isAuth: true, payload }
  }
  catch {
    return { isAuth: false, error: 'invalid-payload' }
  }
}
