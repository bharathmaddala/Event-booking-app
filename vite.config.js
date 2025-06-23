import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['aws-amplify'], // Simplified
    esbuildOptions: {
      target: 'es2020',
      loader: { '.js': 'jsx' },
      resolveExtensions: ['.jsx', '.js', '.ts', '.tsx']
    }
  }
})