import { config, assertRuntimeConfig, getConfigWarnings } from './config'
import { backupDatabase, restoreDatabase, runMigrations } from './db'
import { createInitialAdmin } from './lib/auth'
import { basenamePath, resolvePath } from './lib/path'
import { cleanupAuditLogs } from './modules/audit'
import { startServer } from './server'

type ParsedArgs = {
  command: string
  options: Record<string, string | boolean>
}

function parseArgs(argv: string[]): ParsedArgs {
  const options: Record<string, string | boolean> = {}
  const positional: string[] = []

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]
    if (!current.startsWith('--')) {
      positional.push(current)
      continue
    }

    const withoutPrefix = current.slice(2)
    const [key, inlineValue] = withoutPrefix.split('=', 2)
    if (inlineValue !== undefined) {
      options[key] = inlineValue
      continue
    }

    const next = argv[index + 1]
    if (next && !next.startsWith('--')) {
      options[key] = next
      index += 1
      continue
    }

    options[key] = true
  }

  return {
    command: positional[0] || 'serve',
    options,
  }
}

function printHelp() {
  console.log(`
blog-wx-bun-service

Commands:
  bun src/index.ts serve
  bun src/index.ts migrate
  bun src/index.ts init-admin --username admin --password secret [--nickname 管理员]
  bun src/index.ts backup [--output .backup/app-YYYYMMDD-HHmmss.sqlite]
  bun src/index.ts restore --input .backup/app.sqlite
  bun src/index.ts check-config
  bun src/index.ts cleanup-audit [--days 90]

Distribution:
  bun run build:binary
  docker compose up --build -d
`)
}

function readRequiredOption(options: Record<string, string | boolean>, key: string) {
  const value = options[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`缺少参数 --${key}`)
  }
  return value.trim()
}

function readOptionalPositiveIntOption(options: Record<string, string | boolean>, key: string, fallback: number) {
  const value = options[key]
  if (value === undefined || value === true) {
    return fallback
  }
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`参数 --${key} 必须是正整数`)
  }
  return parsed
}

function makeBackupFilename() {
  const now = new Date()
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('')
  const time = [
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('')
  return `.backup/app-${date}-${time}.sqlite`
}

const args = parseArgs(process.argv.slice(2))

if (args.options.help || args.command === 'help') {
  printHelp()
  process.exit(0)
}

switch (args.command) {
  case 'serve': {
    startServer()
    break
  }

  case 'migrate': {
    runMigrations()
    console.log(`[blog-wx-bun-service] migrations applied on ${config.databasePath}`)
    break
  }

  case 'init-admin': {
    const username = readRequiredOption(args.options, 'username')
    const password = readRequiredOption(args.options, 'password')
    const nickname = typeof args.options.nickname === 'string' ? args.options.nickname.trim() : undefined
    const user = await createInitialAdmin(username, password, nickname)
    console.log(`[blog-wx-bun-service] initial admin created: ${user.username}`)
    break
  }

  case 'backup': {
    const output = typeof args.options.output === 'string' ? args.options.output : makeBackupFilename()
    const resolvedPath = backupDatabase(output)
    console.log(`[blog-wx-bun-service] database backup created: ${resolvedPath}`)
    break
  }

  case 'restore': {
    const input = readRequiredOption(args.options, 'input')
    const restoredPath = restoreDatabase(input)
    console.log(`[blog-wx-bun-service] database restored to: ${restoredPath}`)
    break
  }

  case 'check-config': {
    assertRuntimeConfig('serve')
    const warnings = getConfigWarnings('serve')
    const safeDatabasePath = resolvePath(config.databasePath)
    console.log(`[blog-wx-bun-service] config ok`)
    console.log(`nodeEnv=${config.nodeEnv}`)
    console.log(`databasePath=${safeDatabasePath}`)
    console.log(`databaseFile=${basenamePath(safeDatabasePath)}`)
    if (!warnings.length) {
      console.log('warnings=none')
    }
    else {
      warnings.forEach(warning => console.log(`warning=${warning}`))
    }
    break
  }

  case 'cleanup-audit': {
    const retentionDays = readOptionalPositiveIntOption(args.options, 'days', config.auditRetentionDays)
    const result = cleanupAuditLogs(retentionDays)
    console.log('[blog-wx-bun-service] audit cleanup completed')
    console.log(`retentionDays=${result.retentionDays}`)
    console.log(`cutoffIso=${result.cutoffIso}`)
    console.log(`matchedBeforeCleanup=${result.matchedBeforeCleanup}`)
    console.log(`deletedCount=${result.deletedCount}`)
    console.log(`totalBeforeCleanup=${result.totalBeforeCleanup}`)
    console.log(`totalAfterCleanup=${result.totalAfterCleanup}`)
    break
  }

  default: {
    console.error(`[blog-wx-bun-service] unknown command: ${args.command}`)
    printHelp()
    process.exit(1)
  }
}
