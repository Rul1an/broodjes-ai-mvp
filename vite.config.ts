import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import vueDevTools from 'vite-plugin-vue-devtools';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Laad omgevingsvariabelen
  const env = loadEnv(mode, process.cwd(), '');

  return {
    // Base URL voor de applicatie (handig voor productie)
    base: env.VITE_APP_BASE_URL || '/',

    // Plugins
    plugins: [
      vue({
        script: {
          defineModel: true,
          propsDestructure: true,
        },
      }),
      vueDevTools(),
    ],

    // Resolve configuratie
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
      // Voeg bestandsextensies toe die geïmporteerd kunnen worden
      extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.vue'],
    },

    // Server configuratie voor development
    server: {
      port: parseInt(env.VITE_APP_PORT || '3000', 10),
      open: true, // Open de browser automatisch
      cors: true, // Sta CORS toe
      strictPort: true, // Stop als de poort in gebruik is
    },

    // Build configuratie
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: mode !== 'production', // Genereer sourcemaps in development
      minify: mode === 'production' ? 'esbuild' : false,
      rollupOptions: {
        output: {
          // Maak chunks voor betere caching
          manualChunks: {
            'vue-vendor': ['vue', 'vue-router', 'pinia'],
          },
        },
      },
    },

    // Test configuratie
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './tests/setup.ts',
      coverage: {
        reporter: ['text', 'json', 'html'],
      },
    },
  };
});
