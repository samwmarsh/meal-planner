import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    watch: {
      // Force polling for Docker on Windows — inotify doesn't work across volume mounts
      usePolling: true,
      interval: 500,
    },
  },
});

