import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: true,
    // Integration tests share one Postgres database and truncate it between
    // tests (see src/test/helpers.ts resetDb) — running files in parallel
    // workers races those truncations against each other.
    poolOptions: {
      threads: { singleThread: true },
    },
  },
})
