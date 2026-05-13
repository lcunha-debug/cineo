import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.cineo.editor',
  appName: 'Cineo',
  webDir: 'dist-mobile',
  server: {
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: '#080810',
      showSpinner: false,
    },
    Filesystem: {
      // Permissão de leitura/escrita já configurada no AndroidManifest
    },
  },
}

export default config
