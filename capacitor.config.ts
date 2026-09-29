import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.github.gumbrich.coolerwalks',
  appName: 'Cooler Walks',
  webDir: 'native-web',
  ...(process.env.COOLER_DEV_DOWNLOADS === '1'
    ? { android: { allowMixedContent: true }, server: { cleartext: true } }
    : {}),
  backgroundColor: '#f6f4eb',
  ios: { contentInset: 'never', preferredContentMode: 'mobile' },
  plugins: {
    SystemBars: { style: 'LIGHT', insetsHandling: 'css' },
    SplashScreen: {
      launchShowDuration: 750,
      backgroundColor: '#f6f4eb',
      showSpinner: false,
      androidScaleType: 'CENTER_INSIDE',
    },
  },
};

export default config;
