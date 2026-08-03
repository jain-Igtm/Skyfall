import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.jainigtm.skyfall',
  appName: 'Skyfall',
  webDir: 'dist',
  android: {
    backgroundColor: '#05080d',
    allowMixedContent: false,
  },
}

export default config
