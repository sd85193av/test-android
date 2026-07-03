import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.chenyotech.dongshaninventory',
  appName: '東山鴨頭庫存管理',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
}

export default config
