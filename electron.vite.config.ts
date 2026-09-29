import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: {
      index: resolve('src/preload/index.ts'),
      capture: resolve('src/preload/capture.ts'),
    } } },
  },
  renderer: {
    resolve: { alias: { '@': resolve('src/renderer'), '@shared': resolve('src/shared') } },
    plugins: [react(), tailwindcss()],
    root: resolve('src/renderer'),
    build: { minify: true, rollupOptions: { input: {
      index: resolve('src/renderer/index.html'),
      capture: resolve('src/renderer/capture.html'),
    } } },
  },
})
