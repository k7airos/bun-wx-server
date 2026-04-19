import { badRequest } from '../../lib/errors'
import { extnamePath } from '../../lib/path'

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
const MAX_CONTENT_LENGTH = 10 * 1024 * 1024

export function validateUploadFilename(filename: string) {
  const ext = extnamePath(filename).toLowerCase()
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw badRequest('文件类型不支持，仅支持 jpg/jpeg/png/gif/webp')
  }
}

export function generateCosKey(userId: string, filename: string, folder?: { name: string }) {
  validateUploadFilename(filename)

  const date = new Date()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const ymd = `${date.getFullYear()}${month}${day}`

  if (folder?.name) {
    return `blog/${userId}/${folder.name}/${ymd}_${filename}`
  }
  return `blog/${userId}/${ymd}/${ymd}_${filename}`
}

export function buildCosPolicy(resource: string) {
  return {
    version: '2.0',
    statement: [
      {
        action: [
          'name/cos:PutObject',
          'name/cos:InitiateMultipartUpload',
          'name/cos:ListMultipartUploads',
          'name/cos:ListParts',
          'name/cos:UploadPart',
          'name/cos:CompleteMultipartUpload',
        ],
        effect: 'allow',
        resource: [resource],
        condition: {
          string_like: {
            'cos:content-type': 'image/*',
          },
          numeric_less_than_equal: {
            'cos:content-length': MAX_CONTENT_LENGTH,
          },
        },
      },
    ],
  }
}
