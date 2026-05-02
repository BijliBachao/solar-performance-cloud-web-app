import { defineConfig } from 'vitest/config'
import path from 'path'

// Tests run offline against mocked fetch; no DB or vendor calls.
// Path alias mirrors tsconfig.json so test imports of `@/lib/...` resolve.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
  test: {
    environment: 'node',
    include: ['lib/__tests__/**/*.test.ts'],
    // Pollers transitively import @prisma/client which loads native bindings
    // at module-evaluation time. We mock those modules in each test file, but
    // setting globals=false keeps a clean module graph per test file.
    globals: false,
  },
})
