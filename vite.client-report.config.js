import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'dist/admin',
    emptyOutDir: false,
    lib: {
      entry: 'src/client-report-pdf.js',
      formats: ['es'],
      fileName: () => 'client-report-pdf.js'
    }
  }
});
