import { config, assertCosConfig } from '../../config'
import { internalError } from '../../lib/errors'
import { camelizeKeys } from '../../lib/utils'
import { buildCosPolicy, generateCosKey } from './policy'
import { requestCosFederationToken } from './provider'

export async function issueCosCredential(input: {
  userId: string
  filename: string
  folder?: { name: string }
}) {
  assertCosConfig()

  const cosKey = generateCosKey(input.userId, input.filename, input.folder)
  const appId = config.cosBucket.slice(config.cosBucket.lastIndexOf('-') + 1)
  const resource = `qcs::cos:${config.cosRegion}:uid/${appId}:${config.cosBucket}/${cosKey}`
  const raw = await requestCosFederationToken(buildCosPolicy(resource))
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
