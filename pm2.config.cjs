const appName = process.env.PM2_APP_NAME || 'blog-wx-bun-service-prod'
const envFile = process.env.APP_ENV_FILE || '/root/envs/blog-wx-bun-service/.env'
const appPort = process.env.APP_PORT || '3002'
const host = process.env.HOST || '0.0.0.0'

module.exports = {
  apps: [
    {
      name: appName,
      cwd: __dirname,
      script: './scripts/start-prod.sh',
      interpreter: 'bash',
      env: {
        NODE_ENV: 'production',
        HOST: host,
        APP_PORT: appPort,
        APP_ENV_FILE: envFile,
      },
    },
  ],
}
