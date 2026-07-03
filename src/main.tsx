import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import '@fontsource/rajdhani/400.css';
import '@fontsource/rajdhani/500.css';
import '@fontsource/rajdhani/600.css';
import '@fontsource/rajdhani/700.css';
import '@fontsource/share-tech-mono/400.css';
import './styles/globals.css';
import App from './App';

// Browsers only look for a new service worker on a cold navigation (or ~daily),
// and an installed PWA resumed from the background never navigates — so without
// these nudges a phone can sit on a stale build indefinitely. Check hourly and
// every time the app returns to the foreground; autoUpdate then swaps and
// reloads on its own.
const SW_UPDATE_INTERVAL_MS = 60 * 60 * 1000;
registerSW({
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    setInterval(() => void registration.update().catch(() => {}), SW_UPDATE_INTERVAL_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void registration.update().catch(() => {});
    });
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
