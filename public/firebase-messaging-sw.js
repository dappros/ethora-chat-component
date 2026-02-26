// Scripts for firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker by passing in
// your app's Firebase config object.
// These values are extracted from your .env / firebase-config.ts
firebase.initializeApp({
  apiKey: "AIzaSyAdX24nGQ9nQ0IEzVehIk06uxIb-8HeS04",
  authDomain: "ethora-668e9.firebaseapp.com",
  projectId: "ethora-668e9",
  storageBucket: "ethora-668e9.appspot.com",
  messagingSenderId: "972933470054",
  appId: "1:972933470054:web:d4682e76ef02fd9b9cdaa7"
});

// Retrieve an instance of Firebase Messaging so that it can handle background messages.
const messaging = firebase.messaging();
const APP_URL = self.location.origin;

function isSystemPayload(data) {
  return !data?.msgID && !data?.jid && !!data?.userJid;
}

function buildUrl(data) {
  if (isSystemPayload(data)) return APP_URL;
  if (data?.url) return data.url;
  if (!data?.jid) return APP_URL;
  const chatId = String(data.jid).split('@')[0];
  return `${APP_URL}/chat?chatId=${encodeURIComponent(chatId)}`;
}

messaging.onBackgroundMessage((payload) => {
  console.log('[NotifyPolicy] source=push_bg action=received', payload);
  const data = payload.data || {};
  const isSystem = isSystemPayload(data);
  const notificationTitle =
    (isSystem ? 'System' : undefined) ||
    payload.notification?.title || data?.title || 'New Message';
  const notificationOptions = {
    body:
      payload.notification?.body || data?.body || 'You have a new message.',
    icon: payload.notification?.image || '/favicon.ico',
    data: {
      ...data,
      url: buildUrl(data),
      messageId: payload.messageId || data?.msgID || null,
    },
  };

  console.log(
    `[NotifyPolicy] source=push_bg action=show reason=${isSystem ? 'system' : 'background'} msgId=${notificationOptions.data.messageId || ''}`
  );
  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || APP_URL;
  console.log('[NotifyPolicy] source=push_bg action=click', { url: urlToOpen });
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
