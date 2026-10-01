import type { CapacitorConfig } from '@capacitor/cli';

// Android shell for the home-screen Ascend widget. The web build in dist/ is
// bundled into the APK; run `npm run android` after web changes.
const config: CapacitorConfig = {
  appId: 'app.thesystem.sololeveling',
  appName: 'The System',
  webDir: 'dist',
  android: { backgroundColor: '#05060d' },
};

export default config;
