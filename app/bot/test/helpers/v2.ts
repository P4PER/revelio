import { ComponentType } from 'discord.js'

// A component as Discord receives it. Only the fields the tests read.
type Json = {
  type: number
  content?: string
  components?: Json[]
  accessory?: Json
  items?: { media: { url: string }; description?: string | null }[]
  media?: { url: string }
  description?: string | null
  url?: string
  label?: string
  custom_id?: string
  disabled?: boolean
  accent_color?: number | null
}

type Payload = { components?: readonly unknown[] }

function toJson(component: unknown): Json {
  const encodable = component as { toJSON?: () => Json }
  return typeof encodable.toJSON === 'function' ? encodable.toJSON() : (component as Json)
}

// Every node of a V2 payload, depth first, accessories included.
export function flatten(payload: Payload): Json[] {
  const out: Json[] = []
  const walk = (node: Json): void => {
    out.push(node)
    node.components?.forEach(walk)
    if (node.accessory) walk(node.accessory)
  }
  for (const component of payload.components ?? []) walk(toJson(component))
  return out
}

// All text displays' content, in order, one per line.
export function textOf(payload: Payload): string {
  return flatten(payload)
    .filter((n) => n.type === ComponentType.TextDisplay)
    .map((n) => n.content ?? '')
    .join('\n')
}

// Every image URL a payload shows: gallery items and thumbnails.
export function mediaUrls(payload: Payload): string[] {
  return flatten(payload).flatMap((n) => {
    if (n.type === ComponentType.MediaGallery) return (n.items ?? []).map((i) => i.media.url)
    if (n.type === ComponentType.Thumbnail && n.media) return [n.media.url]
    return []
  })
}

export function buttonsOf(payload: Payload): Json[] {
  return flatten(payload).filter((n) => n.type === ComponentType.Button)
}

// The text of the first "## " heading, markdown escapes left as they are.
export function titleOf(payload: Payload): string {
  return /^## (.*)$/m.exec(textOf(payload))?.[1] ?? ''
}
