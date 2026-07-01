export function imageKey(id: string): string {
  return `cards/${id}.png`
}

export function thumbKey(id: string): string {
  return `cards/thumb/${id}.jpg`
}

export function symbolKey(code: string): string {
  return `symbols/${code}.png`
}

export function imageUrl(base: string, key: string): string {
  return `${base.replace(/\/$/, '')}/${key}`
}
