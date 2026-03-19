import { getFirebaseMessaging } from '../firebase-config';
import { getToken, onMessage, MessagePayload, Messaging } from 'firebase/messaging';

/**
 * requestNotificationPermission()
 * Requests permission from the user to display notifications.
 * @returns boolean indicating if permission was granted.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!('Notification' in window)) {
    return false;
  }

  const permission = await Notification.requestPermission();
  return permission === 'granted';
}

interface FcmRegistrationOptions {
  vapidPublicKey?: string;
  serviceWorkerPath?: string;
  serviceWorkerScope?: string;
  firebaseConfig?: any;
  debug?: boolean;
}

/**
 * registerFirebaseServiceWorker()
 * Ensures the Firebase Messaging service worker is registered.
 * FCM requires the SW to be registered before getToken() is called.
 * @returns ServiceWorkerRegistration or null on failure.
 */
async function registerFirebaseServiceWorker(
  options: FcmRegistrationOptions = {}
): Promise<ServiceWorkerRegistration | null> {
  let serviceWorkerPath = options.serviceWorkerPath || '/firebase-messaging-sw.js';
  const serviceWorkerScope = options.serviceWorkerScope || '/';

  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  // Append config as URL params so the SW doesn't need to be manually edited
  const config = options.firebaseConfig;
  if (config && config.apiKey && config.appId) {
    const params = new URLSearchParams();
    params.append('apiKey', config.apiKey || '');
    params.append('authDomain', config.authDomain || '');
    params.append('projectId', config.projectId || '');
    params.append('storageBucket', config.storageBucket || '');
    params.append('messagingSenderId', config.messagingSenderId || '');
    params.append('appId', config.appId || '');
    
    const separator = serviceWorkerPath.includes('?') ? '&' : '?';
    serviceWorkerPath = `${serviceWorkerPath}${separator}${params.toString()}`;
  }

  try {
    // Re-use an already active registration if it matches the path (with params)
    const existing = await navigator.serviceWorker.getRegistrations();
    const alreadyRegistered = existing.find((r) =>
      r.active?.scriptURL?.includes(serviceWorkerPath)
    );
    if (alreadyRegistered) {
      return alreadyRegistered;
    }
    const registration = await navigator.serviceWorker.register(
      serviceWorkerPath,
      { scope: serviceWorkerScope }
    );
    if (options?.debug) {
      console.log('[PushNotifications] Firebase service worker registered:', registration.scope);
    }
    return registration;
  } catch (err) {
    if (options?.debug) {
      console.warn('[PushNotifications] Failed to register Firebase service worker:', err);
    }
    return null;
  }
}

/**
 * getFCMToken()
 * Obtains the FCM registration token for the current device/browser.
 * @param options - VAPID key and service worker settings.
 * @returns The FCM token or null if failed.
 */
export async function getFCMToken(options: FcmRegistrationOptions = {}): Promise<string | null> {
  try {
    const messaging = getFirebaseMessaging(options.firebaseConfig);
    if (!messaging) return null;

    const swRegistration = await registerFirebaseServiceWorker(options);

    const token = await getToken(messaging, {
      vapidKey:
        options.vapidPublicKey || (import.meta as any).env?.VITE_VAPID_PUBLIC_KEY,
      ...(swRegistration ? { serviceWorkerRegistration: swRegistration } : {}),
    });

    if (token) {
      if (options?.debug) {
        console.log('[PushNotifications] FCM token obtained successfully');
      }
      return token;
    } else {
      if (options?.debug) {
        console.warn(
          '[PushNotifications] No registration token available. Request permission to generate one.'
        );
      }
      return null;
    }
  } catch (error) {
    if (options?.debug) {
      console.warn('[PushNotifications] An error occurred while retrieving FCM token:', error);
    }
    return null;
  }
}

/**
 * initPushNotifications()
 * Orchestrates the full push initialization flow.
 * @returns The FCM token if successful, or null.
 */
export async function initPushNotifications(
  options: FcmRegistrationOptions = {}
): Promise<string | null> {
  const hasPermission = await requestNotificationPermission();

  if (!hasPermission) {
    if (options?.debug) {
      console.warn('[PushNotifications] Push notification permission denied');
    }
    return null;
  }

  return getFCMToken(options);
}

/**
 * listenForForegroundMessages()
 * Subscribes to FCM messages while the app is in the foreground.
 * Returns an unsubscribe function.
 */
export function listenForForegroundMessages(
  handler: (payload: MessagePayload) => void,
  firebaseConfig?: any
): () => void {
  const messaging = getFirebaseMessaging(firebaseConfig);
  if (!messaging) return () => {};
  return onMessage(messaging, handler);
}
