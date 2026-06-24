import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/unit/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    typecheck: {
      enabled: true,
      checker: 'tsc',
      include: ['test/types/**/*.test-d.ts'],
      tsconfig: './tsconfig.json',
    },
  },
})
