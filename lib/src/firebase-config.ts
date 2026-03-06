import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getMessaging, Messaging } from 'firebase/messaging';

export const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let firebaseApp: FirebaseApp | undefined;
let messagingInstance: Messaging | undefined;

export const getFirebaseMessaging = (customConfig?: any): Messaging | null => {
  if (typeof window === 'undefined') return null;

  try {
    if (!firebaseApp) {
      const activeApps = getApps();
      if (activeApps.length > 0 && !customConfig) {
        firebaseApp = activeApps[0];
      } else {
        firebaseApp = initializeApp(customConfig || config);
      }
    }

    if (!messagingInstance && firebaseApp) {
      messagingInstance = getMessaging(firebaseApp);
    }

    return messagingInstance || null;
  } catch (error) {
    console.error('[FirebaseConfig] Failed to initialize messaging:', error);
    return null;
  }
};

export const app = getApps().length > 0 ? getApp() : initializeApp(config);
export const messaging = getMessaging(app);
