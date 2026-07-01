import { MeiliSearch } from 'meilisearch'

export function createMeiliClient(host: string, apiKey: string): MeiliSearch {
  return new MeiliSearch({ host, apiKey })
}
