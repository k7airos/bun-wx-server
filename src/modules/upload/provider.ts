import { config } from '../../config'
import { internalError } from '../../lib/errors'
import { parseWithSchema } from '../../lib/validation'
import { cosFederationTokenResponseSchema } from './external-schemas'

function json2str(obj: Record<string, string | number>) {
  return Object.keys(obj)
    .sort()
    .map(key => `${key}=${obj[key] ?? ''}`)
    .join('&')
}

function getSignature(params: Record<string, string | number>, secretKey: string, method: string, host: string) {
  const formatString = `${method}${host}/?${json2str(params)}`
  const hasher = new Bun.CryptoHasher('sha1', secretKey)
  hasher.update(formatString)
  return hasher.digest('base64')
}

export async function requestCosFederationToken(policy: Record<string, unknown>) {
  const host = 'sts.tencentcloudapi.com'
  const policyStr = JSON.stringify(policy)
  const params: Record<string, string | number> = {
    SecretId: config.cosSecretId,
    Timestamp: Math.floor(Date.now() / 1000),
    Nonce: Math.round(Math.random() * 10000 + 10000),
    Action: 'GetFederationToken',
    DurationSeconds: config.cosStsDurationSeconds,
    Version: '2018-08-13',
    Region: config.cosRegion,
    Policy: encodeURIComponent(policyStr),
    Name: 'bun-cos-sts',
  }
  params.Signature = getSignature(params, config.cosSecretKey, 'POST', host)

  const response = await fetch(`https://${host}/`, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
      'host': host,
    },
    body: new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)])).toString(),
  })

  if (!response.ok) {
    throw internalError(`获取 COS 临时凭证失败: HTTP ${response.status}`)
  }

  return parseWithSchema(
    cosFederationTokenResponseSchema,
    await response.json(),
    'COS STS 响应格式异常',
  )
}
