export function imageKey(id: string): string {
  return `cards/${id}.webp`
}

export function thumbKey(id: string): string {
  return `cards/thumb/${id}.webp`
}

export function symbolKey(code: string): string {
  return `symbols/${code}.webp`
}

export function imageUrl(base: string, key: string): string {
  return `${base.replace(/\/$/, '')}/${key}`
}
