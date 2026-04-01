import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getMessaging, Messaging } from 'firebase/messaging';
import { sha256 } from 'js-sha256';

export const defaultConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const firebaseAppsByName = new Map<string, FirebaseApp>();
const messagingByAppName = new Map<string, Messaging>();

const normalizeValue = (value?: string): string =>
  (value || '').toString().trim().toLowerCase();

const getConfigSignature = (config: Record<string, any>): string => {
  return sha256(
    [
      normalizeValue(config?.appId),
      normalizeValue(config?.projectId),
      normalizeValue(config?.messagingSenderId),
      normalizeValue(config?.apiKey),
      normalizeValue(config?.authDomain),
      normalizeValue(config?.storageBucket),
    ].join('|')
  ).slice(0, 16);
};

const getFirebaseAppName = (config: Record<string, any>): string =>
  `ethora-firebase-${getConfigSignature(config)}`;

const getFirebaseConfig = (customConfig?: any): Record<string, any> => {
  return customConfig || defaultConfig;
};

export const getFirebaseApp = (customConfig?: any): FirebaseApp | null => {
  try {
    const config = getFirebaseConfig(customConfig);
    const appName = getFirebaseAppName(config);

    const cached = firebaseAppsByName.get(appName);
    if (cached) {
      return cached;
    }

    const existing = getApps().find((candidate) => candidate.name === appName);
    if (existing) {
      firebaseAppsByName.set(appName, existing);
      return existing;
    }

    const app = initializeApp(config, appName);
    firebaseAppsByName.set(appName, app);
    return app;
  } catch (error) {
    console.error('[FirebaseConfig] Failed to initialize Firebase app:', error);
    return null;
  }
};

export const getFirebaseMessaging = (customConfig?: any): Messaging | null => {
  if (typeof window === 'undefined') return null;

  try {
    const app = getFirebaseApp(customConfig);
    if (!app) return null;

    const cached = messagingByAppName.get(app.name);
    if (cached) {
      return cached;
    }

    const messaging = getMessaging(app);
    messagingByAppName.set(app.name, messaging);

    return messaging;
  } catch (error) {
    console.error('[FirebaseConfig] Failed to initialize messaging:', error);
    return null;
  }
};

// Legacy exports for backward compatibility.
// Important: avoid creating the Firebase [DEFAULT] app to prevent duplicate-app
// when runtime push config differs from env defaults.
export const app = getFirebaseApp(defaultConfig) || initializeApp(defaultConfig, 'ethora-firebase-fallback');
export const messaging = getFirebaseMessaging(defaultConfig) || getMessaging(app);
