import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // rutas relativas: funciona igual en la raíz de un dominio que bajo un subpath detrás de un proxy
  base: './',
  plugins: [react(), tailwindcss()],
  // en desarrollo la API la sirve `npm run dev:server`
  server: { proxy: { '/api': 'http://127.0.0.1:3002' } },
  // cada test tiene que terminar en pocos segundos: uno que no lo logre es un hallazgo, no un tope para subir
  test: { include: ['src/**/*.test.ts'], testTimeout: 3000, hookTimeout: 3000 },
  // FullCalendar es la mayor parte del JS: en su propio chunk ninguno pasa los 500 kB que avisa Vite
  build: {
    rolldownOptions: {
      output: { codeSplitting: { groups: [{ name: 'fullcalendar', test: /node_modules[\\/]@fullcalendar/ }] } },
    },
  },
})
