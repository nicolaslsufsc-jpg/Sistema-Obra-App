import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'testes/**/*.test.ts'],
    setupFiles: ['fake-indexeddb/auto'],
    testTimeout: 30_000,
    // Os testes de integração usam o mesmo banco local: um arquivo de cada vez.
    fileParallelism: false,
  },
})
