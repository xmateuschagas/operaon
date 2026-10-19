import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

// Em dev, chamadas relativas /api são encaminhadas sem exigir CORS.
export default defineConfig({ plugins: [react(), tailwind()], server: { proxy: { '/api': { target: process.env.API_PROXY_TARGET ?? 'http://localhost:3000', rewrite: (path) => path.replace(/^\/api/, '') } } } });
