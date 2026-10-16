import { Meilisearch } from 'meilisearch'

export function createMeiliClient(host: string, apiKey: string): Meilisearch {
  return new Meilisearch({ host, apiKey })
}
