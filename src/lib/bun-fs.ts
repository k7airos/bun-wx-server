function runCommand(cmd: string[], errorMessage: string) {
  const result = Bun.spawnSync({
    cmd,
    stdout: 'ignore',
    stderr: 'pipe',
  })

  if (result.exitCode !== 0) {
    const stderr = Buffer.from(result.stderr).toString('utf8').trim()
    throw new Error(stderr || errorMessage)
  }
}

export function ensureDirSync(path: string) {
  runCommand(['mkdir', '-p', path], `创建目录失败: ${path}`)
}

export function copyFileSync(source: string, destination: string) {
  runCommand(['cp', source, destination], `复制文件失败: ${source} -> ${destination}`)
}

export function existsSync(path: string) {
  const result = Bun.spawnSync({
    cmd: ['test', '-e', path],
    stdout: 'ignore',
    stderr: 'ignore',
  })
  return result.exitCode === 0
}

export function removeSync(path: string) {
  runCommand(['rm', '-rf', path], `删除路径失败: ${path}`)
}

export function makeTempDir(prefix: string) {
  const base = process.env.TMPDIR || '/tmp'
  const template = `${base.replace(/\/+$/g, '')}/${prefix}.XXXXXX`
  const result = Bun.spawnSync({
    cmd: ['mktemp', '-d', template],
    stdout: 'pipe',
    stderr: 'pipe',
  })

  if (result.exitCode !== 0) {
    const stderr = Buffer.from(result.stderr).toString('utf8').trim()
    throw new Error(stderr || `创建临时目录失败: ${template}`)
  }

  return Buffer.from(result.stdout).toString('utf8').trim()
}
