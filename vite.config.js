import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,                       // слушать снаружи (0.0.0.0)
    // 1) Явно перечислить домены, с которых можно открывать dev-сервер:
    allowedHosts: [
      'd4684685ea09.ngrok-free.app'
    ],
    hmr: {                     // чтобы HMR-вебсокет работал с туннелем на телефоне
      host: 'd4684685ea09.ngrok-free.app',
      clientPort: 443,
      protocol: 'wss'
    }
  }
})
