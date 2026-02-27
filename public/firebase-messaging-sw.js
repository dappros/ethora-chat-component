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

function buildUrl(payload) {
  const data = payload?.data || {};
  const notification = payload?.notification || {};
  if (data.url) return data.url;
  
  // Admin push might provide the URL in the title
  const title = notification.title || data.title || '';
  if (title.startsWith('http')) return title;

  if (isSystemPayload(data)) return APP_URL;
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
      url: buildUrl(payload),
      messageId: payload.messageId || data?.msgID || null,
    },
  };

  return clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
    const isAnyTabVisible = windowClients.some(client => client.visibilityState === 'visible');
    
    // If no tabs are visible, we should definitely show a notification.
    // If some tabs ARE visible, they might handle it via the bridge.
    
    windowClients.forEach((client) => {
      client.postMessage({
        type: 'PUSH_FOREGROUND_BRIDGE',
        payload,
      });
    });

    if (!isAnyTabVisible) {
      console.log(
        `[NotifyPolicy] source=push_bg action=show reason=${isSystem ? 'system' : 'background'} msgId=${notificationOptions.data.messageId || ''}`
      );
      return self.registration.showNotification(notificationTitle, notificationOptions);
    } else {
      console.log(
        `[NotifyPolicy] source=push_bg action=skip reason=tab_visible msgId=${notificationOptions.data.messageId || ''}`
      );
    }
  });
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[NotifyPolicy] source=push_bg action=click_start');
  event.notification.close();
  
  const urlToOpen = event.notification.data?.url || APP_URL;
  console.log('[NotifyPolicy] source=push_bg action=click_url', { url: urlToOpen });
  
  async function handleClick() {
    try {
      const windowClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      console.log('[NotifyPolicy] source=push_bg action=clients_found', { count: windowClients.length });
      
      // 1. Try to find an exactly matching URL
      for (const client of windowClients) {
        if (client.url === urlToOpen && 'focus' in client) {
          console.log('[NotifyPolicy] source=push_bg action=focus_exact', { url: client.url });
          return client.focus();
        }
      }

      // 2. Try to find any client on our origin, focus it, and navigate
      for (const client of windowClients) {
        try {
          const clientOrigin = new URL(client.url).origin;
          const swOrigin = self.location.origin;
          if (clientOrigin === swOrigin && 'focus' in client) {
            console.log('[NotifyPolicy] source=push_bg action=focus_and_navigate', { from: client.url, to: urlToOpen });
            const focusedClient = await client.focus();
            if (focusedClient && 'navigate' in focusedClient) {
              return focusedClient.navigate(urlToOpen);
            }
          }
        } catch (e) {
          // Ignore invalid URLs
        }
      }

      // 3. Fallback: Open a new window
      if (clients.openWindow) {
        console.log('[NotifyPolicy] source=push_bg action=open_new_window', { url: urlToOpen });
        return clients.openWindow(urlToOpen);
      }
    } catch (err) {
      console.error('[NotifyPolicy] source=push_bg action=click_error', err);
      // Last resort fallback
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    }
  }

  event.waitUntil(handleClick());
});
