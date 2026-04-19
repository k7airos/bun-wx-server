function normalize(input: string) {
  return input.replace(/\\/g, '/')
}

export function joinPath(...parts: string[]) {
  const normalized = parts
    .filter(Boolean)
    .map((part, index) => {
      const value = normalize(part)
      if (index === 0) {
        return value.replace(/\/+$/g, '')
      }
      return value.replace(/^\/+/g, '').replace(/\/+$/g, '')
    })
    .filter(Boolean)

  if (!normalized.length) {
    return '.'
  }

  const first = normalized[0]
  const joined = normalized.join('/')
  return first.startsWith('/') ? `/${joined.replace(/^\/+/g, '')}` : joined
}

export function dirnamePath(input: string) {
  const value = normalize(input).replace(/\/+$/g, '')
  if (!value || value === '/') {
    return '/'
  }

  const index = value.lastIndexOf('/')
  if (index <= 0) {
    return '.'
  }

  return value.slice(0, index)
}

export function basenamePath(input: string) {
  const value = normalize(input).replace(/\/+$/g, '')
  if (!value) {
    return ''
  }
  const index = value.lastIndexOf('/')
  return index === -1 ? value : value.slice(index + 1)
}

export function extnamePath(input: string) {
  const base = basenamePath(input)
  const index = base.lastIndexOf('.')
  if (index <= 0) {
    return ''
  }
  return base.slice(index)
}

export function resolvePath(...parts: string[]) {
  const segments = parts
    .filter(Boolean)
    .flatMap(part => normalize(part).split('/'))

  const resolved: string[] = []
  let absolute = false

  for (const part of segments) {
    if (!part || part === '.') {
      continue
    }
    if (part === '..') {
      if (resolved.length > 0) {
        resolved.pop()
      }
      continue
    }
    if (part === '') {
      absolute = true
      continue
    }
    resolved.push(part)
  }

  const output = resolved.join('/')
  return absolute ? `/${output}` : output || (absolute ? '/' : '.')
}
