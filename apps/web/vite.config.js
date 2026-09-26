import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API = process.env.VITE_API_PROXY || 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    host: true, // reachable from phones on the same Wi-Fi (QR feedback page)
    proxy: {
      '/api': API,
      '/socket.io': { target: API, ws: true },
    },
  },
});
