// Web Push handlers — imported into the generated service worker via
// workbox `importScripts` (see vite.config.ts).

self.addEventListener('push', (event) => {
  let data = { title: '[SYSTEM]', body: '', url: '/' };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    // keep defaults on malformed payloads
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    }),
  );
});
