import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The Meilisearch integration tests (index-cards, main) share the
    // cards-<lang> index names and clean them up in afterAll. Running test
    // files in parallel lets one file delete an index another is querying.
    // Run test files sequentially to keep the shared external state isolated.
    fileParallelism: false,
  },
})
