import type { CapacitorConfig } from '@capacitor/cli';

// Wraps the built web app (dist/) in a native Android shell.
// Build the APK locally with `npm run android:apk`, or grab it from the
// "Android APK" GitHub Actions workflow.
const config: CapacitorConfig = {
  appId: 'com.wolfberserkr.thesystem',
  appName: 'The System',
  webDir: 'dist',
  backgroundColor: '#05060d',
  android: {
    allowMixedContent: false,
  },
};

export default config;
