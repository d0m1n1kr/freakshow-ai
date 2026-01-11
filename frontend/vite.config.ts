import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    fs: {
      // Allow serving files from the episodes directory (symlinked)
      allow: ['..']
    },
    watch: {
      // Disable polling - use native file system events (much more efficient)
      usePolling: false,
      // Batch file changes to reduce CPU usage during rapid file changes
      atomic: true,
      // Aggressively exclude Rust target directories - this is the main CPU hog
      // Using glob patterns which are faster than functions for chokidar
      ignored: [
        '**/target/**',
        '**/target',
        '../target/**',
        '../target',
        // Standard exclusions
        '**/node_modules/**',
        '**/.git/**'
      ]
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Separate vendor chunks
          'vue-vendor': ['vue', 'vue-router', 'pinia'],
          'i18n': ['vue-i18n'],
          'd3': ['d3'],
          // Marked is relatively small, can stay in main bundle
        }
      }
    },
    chunkSizeWarningLimit: 1000, // Increase limit since we're splitting chunks
  }
})
