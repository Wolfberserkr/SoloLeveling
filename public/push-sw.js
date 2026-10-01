// Web Push handlers — imported into the generated service worker via
// workbox `importScripts` (see vite.config.ts).

self.addEventListener('push', (event) => {
  let data = { title: '[SYSTEM]', body: '', url: '/', tag: undefined, requireInteraction: false, renotify: false };
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
      // Ascend reminders pass a fixed tag + requireInteraction so the latest
      // reminder replaces the previous one and stays until dismissed.
      ...(data.tag ? { tag: data.tag, renotify: Boolean(data.renotify) } : {}),
      requireInteraction: Boolean(data.requireInteraction),
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
