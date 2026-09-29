import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { cspPlugin } from './server/csp.ts'
import { githubImportPlugin } from './server/github-bridge.ts'

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  define: { __DEMO_MODE__: JSON.stringify(process.env.VITE_CANVAS_DEMO === 'true') },
  // Imported repositories are cloned under .simplicio/workspaces; their index.html or tsconfig.json must not trigger page reloads mid-import.
  server: { host: '127.0.0.1', watch: { ignored: ['**/.simplicio/**'] } },
  plugins: [react(), githubImportPlugin(), cspPlugin()],
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-demo/**',
      '**/.simplicio/**',
      '**/.git/**',
      '**/extension/**',
      '**/.playwright-cli/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts', 'src/**/*.tsx', 'server/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/main.tsx',
        'src/example.ts',
        'src/vite-env.d.ts',
      ],
    },
  },
})
