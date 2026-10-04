import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // rutas relativas: funciona igual en la raíz de un dominio que bajo un subpath detrás de un proxy
  base: './',
  plugins: [react(), tailwindcss()],
  // en desarrollo la API la sirve `npm run dev:server`
  server: { proxy: { '/api': 'http://127.0.0.1:3002' } },
})
