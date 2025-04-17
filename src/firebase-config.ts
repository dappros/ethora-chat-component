export const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

export const app = initializeApp(config);
const messaging = getMessaging(app);

export const requestForToken = async () => {
  try {
    const permission = await Notification.requestPermission();
    console.log('permission', permission);
    if (permission.includes('granted')) {
      console.log('granted');
      try {
        const currentToken = await getToken(messaging, {
          vapidKey: import.meta.env.VITE_PUSH_VAP,
        });

        console.log('currentToken,currentToken', currentToken);

        if (currentToken) {
          console.log('FCM registration token:', currentToken);
          return currentToken;
        } else {
          console.log('No registration token available');
          return null;
        }
      } catch (error) {
        console.error('Error getting token:', error);
      }
    } else {
      console.log('Permission not granted');
      return null;
    }
  } catch (error) {
    console.error('An error occurred while retrieving token:', error);
    return null;
  }
};

onMessage(messaging, (payload) => {
  console.log('Message received in foreground:', payload);

  const notificationTitle = payload.notification?.title || 'New Notification';
  const notificationOptions = {
    body: payload.notification?.body || 'Check out the latest update!',
    icon: '/favicon.ico',
  };

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then((registration) => {
      registration.showNotification(notificationTitle, notificationOptions);
    });
  } else {
    alert(`${notificationTitle}\n${notificationOptions.body}`);
  }
});
