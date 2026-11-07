import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (id.includes('rapier')) return 'rapier';
          if (id.includes('three') || id.includes('postprocessing')) return 'three';
          if (id.includes('@colyseus')) return 'net';
          return undefined;
        },
      },
    },
  },
});
