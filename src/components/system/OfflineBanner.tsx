import { useEffect, useState } from 'react';

/** A thin System banner shown while the device is offline. */
export function OfflineBanner() {
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' && !navigator.onLine);

  useEffect(() => {
    const goOnline = () => setOffline(false);
    const goOffline = () => setOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="safe-top fixed inset-x-0 top-0 z-[60] border-b border-accent-red/40 bg-accent-red/15 py-1 text-center font-sys text-[0.6rem] uppercase tracking-[0.25em] text-accent-red backdrop-blur-sm">
      Link severed — the System will sync when you reconnect
    </div>
  );
}
