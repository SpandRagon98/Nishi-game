import react from '@vitejs/plugin-react';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/**
 * Testing Studio notes (dev server only): POST /__studio/note appends the note, where the tester was
 * standing and a screenshot to studio-notes/ at the repo root, for Claude to read and apply.
 */
function studioNotes(): Plugin {
  const dir = resolve(__dirname, '../../studio-notes');
  return {
    name: 'nishi-studio-notes',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__studio/note', (req, res) => {
        if (req.method !== 'POST') return void ((res.statusCode = 405), res.end());
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          try {
            const { text, context, image } = JSON.parse(body) as { text: string; context: string; image: string | null };
            mkdirSync(dir, { recursive: true });
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            let shot = '';
            if (typeof image === 'string' && image.startsWith('data:image/png;base64,')) {
              writeFileSync(resolve(dir, `${stamp}.png`), Buffer.from(image.slice(22), 'base64'));
              shot = `\n![view](${stamp}.png)\n`;
            }
            const file = resolve(dir, 'NOTES.md');
            const fence = '```';
            appendFileSync(file, `\n## ${new Date().toLocaleString()}\n\n${String(text)}\n\n${fence}\n${String(context)}\n${fence}\n${shot}`);
            const count = (readFileSync(file, 'utf8').match(/^## /gm) ?? []).length;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ file: 'studio-notes/NOTES.md', count }));
          } catch (e) {
            res.statusCode = 400;
            res.end(String(e));
          }
        });
      });
    },
  };
}

export default defineConfig({
  // relative asset paths, so the build works from any folder (GitHub Pages serves it under /<repo>/)
  base: './',
  plugins: [react(), studioNotes()],
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
