import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // VITE_ 접두사 없는 키 → 브라우저 번들에 안 들어감. dev 서버 프록시에서만 헤더로 붙임
  const env = loadEnv(mode, process.cwd(), '')
  const typesafeKey = env.TYPESAFE_API_KEY ?? ''

  return {
    devtools: {
      // Remove this `apply` property to enable devtools for build as well
      apply: 'serve',
    },
    plugins: [react(), tailwindcss()],
    server: {
      // ngrok 터널로 접속 허용 (Vite는 기본적으로 모르는 Host 헤더 차단)
      allowedHosts: ['.ngrok-free.app'],
      proxy: {
        // (조원호) 음성 명령 → TypeSafe Jev. 키 없으면 401 → 클라이언트가 Groq로 넘김
        '/api/jev': {
          target: 'https://api.typesafe.ai',
          changeOrigin: true,
          rewrite: () => '/v1/systemone',
          headers: typesafeKey ? { Authorization: `Bearer ${typesafeKey}` } : {},
        },
      },
    },
  }
})
