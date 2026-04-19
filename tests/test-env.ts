import { makeTempDir } from '../src/lib/bun-fs'
import { joinPath } from '../src/lib/path'

const sharedTempRoot = process.env.BLOG_WX_TEST_TEMP_ROOT || makeTempDir('blog-wx-bun-service-test')

process.env.BLOG_WX_TEST_TEMP_ROOT = sharedTempRoot
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-secret-for-service-tests'
process.env.DATABASE_PATH = joinPath(sharedTempRoot, 'app.sqlite')
process.env.COS_SECRET_ID = 'test-secret-id'
process.env.COS_SECRET_KEY = 'test-secret-key'
process.env.COS_BUCKET = 'test-bucket-1250000000'
process.env.COS_REGION = 'ap-guangzhou'
process.env.APP_ALLOWED_SOURCES = 'zotepad,zotepad-desktop'
process.env.GITHUB_CLIENT_ID = 'github-client-id'
process.env.GITHUB_CLIENT_SECRET = 'github-client-secret'
process.env.GITHUB_CALLBACK_URL = 'http://localhost/api/v1/auth/github/callback'
process.env.OAUTH_FRONTEND_CALLBACK_URL = 'http://frontend.local/auth/callback'

export const testTempRoot = sharedTempRoot
