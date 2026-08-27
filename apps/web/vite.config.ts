import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    // La pantalla de Manual lee los documentos de `docs/`, que está fuera de
    // apps/web. Se leen del repositorio y no de una copia a propósito: lo que
    // lee un trabajador tiene que ser el mismo fichero que se mantiene con el
    // código, o al mes son dos cosas distintas.
    fs: { allow: ['../..'] },
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
