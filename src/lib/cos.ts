import { createHmac } from 'node:crypto'
import path from 'node:path'
import { config, assertCosConfig } from '../config'
import { badRequest, internalError } from './errors'
import { camelizeKeys } from './utils'

const COS_ALLOW_ACTIONS = [
  'name/cos:PutObject',
  'name/cos:InitiateMultipartUpload',
  'name/cos:ListMultipartUploads',
  'name/cos:ListParts',
  'name/cos:UploadPart',
  'name/cos:CompleteMultipartUpload',
]

function json2str(obj: Record<string, string | number>) {
  return Object.keys(obj)
    .sort()
    .map(key => `${key}=${obj[key] ?? ''}`)
    .join('&')
}

function getSignature(params: Record<string, string | number>, secretKey: string, method: string, host: string) {
  const formatString = `${method}${host}/?${json2str(params)}`
  return createHmac('sha1', secretKey).update(Buffer.from(formatString, 'utf8')).digest('base64')
}

function generateCosKey(userId: string, filename: string, folder?: { name: string }) {
  const ext = path.extname(filename).toLowerCase()
  const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
  if (!allowedExts.includes(ext)) {
    throw badRequest('文件类型不支持，仅支持 jpg/jpeg/png/gif/webp')
  }

  const date = new Date()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const ymd = `${date.getFullYear()}${month}${day}`

  if (folder?.name) {
    return `blog/${userId}/${folder.name}/${ymd}_${filename}`
  }
  return `blog/${userId}/${ymd}/${ymd}_${filename}`
}

export async function issueCosCredential(input: {
  userId: string
  filename: string
  folder?: { name: string }
}) {
  assertCosConfig()

  const cosKey = generateCosKey(input.userId, input.filename, input.folder)
  const appId = config.cosBucket.slice(config.cosBucket.lastIndexOf('-') + 1)
  const resource = `qcs::cos:${config.cosRegion}:uid/${appId}:${config.cosBucket}/${cosKey}`
  const policy = {
    version: '2.0',
    statement: [
      {
        action: COS_ALLOW_ACTIONS,
        effect: 'allow',
        resource: [resource],
        condition: {
          string_like: {
            'cos:content-type': 'image/*',
          },
          numeric_less_than_equal: {
            'cos:content-length': 10 * 1024 * 1024,
          },
        },
      },
    ],
  }

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

  const raw = await response.json() as {
    Response?: Record<string, any>
  }
  const data = raw.Response

  if (!data) {
    throw internalError('COS STS 返回格式异常')
  }

  if (data.Error) {
    throw internalError(data.Error.Message || 'COS STS 返回错误', data.Error)
  }

  const mapped = camelizeKeys(data)
  return {
    TmpSecretId: mapped.credentials?.tmpSecretId,
    TmpSecretKey: mapped.credentials?.tmpSecretKey,
    SessionToken: mapped.credentials?.sessionToken,
    StartTime: Math.floor(Date.now() / 1000),
    ExpiredTime: mapped.expiredTime,
    Bucket: config.cosBucket,
    Region: config.cosRegion,
    Key: cosKey,
  }
}
