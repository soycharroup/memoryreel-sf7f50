import { defineConfig } from 'vite'; // ^4.3.9
import react from '@vitejs/plugin-react'; // ^4.0.0
import tsconfigPaths from 'vite-tsconfig-paths'; // ^4.2.0
import path from 'path';

// Vite configuration for MemoryReel web application with TV platform optimizations
export default defineConfig({
  // Configure plugins for React and TypeScript support
  plugins: [
    react({
      fastRefresh: true,
      babel: {
        plugins: ['@emotion/babel-plugin']
      }
    }),
    tsconfigPaths()
  ],

  // Path resolution configuration
  resolve: {
    alias: {
      '@': '/src',
      '@components': '/src/components',
      '@hooks': '/src/hooks',
      '@services': '/src/services',
      '@store': '/src/store',
      '@utils': '/src/utils',
      '@types': '/src/types',
      '@constants': '/src/constants',
      '@config': '/src/config',
      '@styles': '/src/styles',
      '@assets': '/src/assets',
      '@features': '/src/features',
      '@layouts': '/src/layouts',
      '@tv': '/src/platforms/tv'
    }
  },

  // Build configuration with TV platform optimizations
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug']
      },
      mangle: {
        safari10: true // Ensure compatibility with WebKit-based TV browsers
      }
    },
    rollupOptions: {
      output: {
        manualChunks: {
          'react-core': ['react', 'react-dom'],
          'redux-core': ['@reduxjs/toolkit', 'react-redux'],
          'i18n-core': ['i18next', 'react-i18next'],
          'tv-platform': ['@tv'],
          'ui-components': ['@components'],
          'data-layer': ['@services', '@store'],
          'utils-layer': ['@utils', '@hooks']
        }
      }
    },
    chunkSizeWarningLimit: 1000,
    cssCodeSplit: true,
    reportCompressedSize: true
  },

  // Development server configuration
  server: {
    port: 3000,
    strictPort: true,
    host: true,
    cors: {
      origin: ['http://localhost:8080'],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      credentials: true
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    },
    hmr: {
      overlay: true
    }
  },

  // Preview server configuration
  preview: {
    port: 3000,
    strictPort: true,
    host: true,
    cors: true
  },

  // Global defines
  define: {
    __APP_VERSION__: 'JSON.stringify(process.env.npm_package_version)',
    __DEV__: "process.env.NODE_ENV === 'development'",
    __PROD__: "process.env.NODE_ENV === 'production'",
    __TV_PLATFORM__: 'true'
  }
});