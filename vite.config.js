import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/convert': 'http://localhost:5001',
      '/convert-excel-to-csv': 'http://localhost:5001',
      '/convert-word-to-pdf': 'http://localhost:5001',
      '/convert-pdf-to-word': 'http://localhost:5001',
    }
  }
})
