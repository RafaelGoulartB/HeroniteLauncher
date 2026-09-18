import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react-swc'
import svgr from 'vite-plugin-svgr'
import path from 'path'

const srcAliases = ['backend', 'frontend', 'common', 'local-library'].map(
  (aliasName) => ({
    find: aliasName,
    replacement: path.join(__dirname, 'src', aliasName)
  })
)

const dependenciesToNotExternalize = [
  '@xhmikosr/decompress',
  '@xhmikosr/decompress-targz',
  '@xhmikosr/decompress-unzip'
]

const optionalNativeDeps = ['ws', 'bufferutil', 'utf-8-validate']

function reportMainBuildWarning(
  warning: { message: string },
  warn: (warning: { message: string }) => void
) {
  const isIntentionalOverlayImport =
    warning.message.includes('src/local-library/') &&
    warning.message.includes(
      'dynamic import will not move module into another chunk'
    )
  if (!isIntentionalOverlayImport) warn(warning)
}

export default defineConfig(({ mode }) => ({
  main: {
    build: {
      rollupOptions: {
        input: 'src/backend/main.ts',
        onwarn: reportMainBuildWarning,
        output: {
          chunkFileNames: `chunks/[name].js`,
          assetFileNames: `chunks/[name].[ext]`
        }
      },
      outDir: 'build/main',
      minify: false,
      sourcemap: 'inline'
    },
    resolve: { alias: srcAliases },
    plugins: [
      externalizeDepsPlugin({
        exclude: dependenciesToNotExternalize,
        include: optionalNativeDeps
      })
    ]
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: 'src/preload/index.ts',
          webviewPreload: 'src/webviewPreload/index.ts'
        },
        output: {
          chunkFileNames: `chunks/[name].js`,
          assetFileNames: `chunks/[name].[ext]`
        }
      },
      outDir: 'build/preload',
      minify: true,
      sourcemap: mode === 'development' ? 'inline' : false
    },
    resolve: { alias: srcAliases },
    plugins: [
      externalizeDepsPlugin({
        exclude: dependenciesToNotExternalize,
        include: optionalNativeDeps
      })
    ]
  },
  renderer: {
    root: '.',
    build: {
      rollupOptions: {
        input: path.resolve('index.html'),
        output: {
          chunkFileNames: `assets/[name].js`,
          assetFileNames: `assets/[name].[ext]`
        }
      },
      target: 'esnext',
      outDir: 'build',
      emptyOutDir: false,
      minify: true,
      sourcemap: mode === 'development' ? 'inline' : false
    },
    resolve: { alias: srcAliases },
    plugins: [react(), svgr()]
  }
}))
