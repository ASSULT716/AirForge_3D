import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  devtools: {
    // Remove this `apply` property to enable devtools for build as well
    apply: 'serve',
  },
  plugins: [react(), tailwindcss()],
  server: {
    // ngrok 터널로 접속 허용 (Vite는 기본적으로 모르는 Host 헤더 차단)
    allowedHosts: ['.ngrok-free.app'],
  },
})
