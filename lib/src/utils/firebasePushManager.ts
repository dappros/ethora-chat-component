import { messaging } from '../firebase-config';
import { getToken, onMessage, MessagePayload } from 'firebase/messaging';

/**
 * requestNotificationPermission()
 * Requests permission from the user to display notifications.
 * @returns boolean indicating if permission was granted.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) {
    console.warn('This browser does not support notifications.');
    return false;
  }

  const permission = await Notification.requestPermission();
  return permission === 'granted';
}

interface FcmRegistrationOptions {
  vapidPublicKey?: string;
  serviceWorkerPath?: string;
  serviceWorkerScope?: string;
}

/**
 * registerFirebaseServiceWorker()
 * Ensures the Firebase Messaging service worker is registered.
 * FCM requires the SW to be registered before getToken() is called.
 * @returns ServiceWorkerRegistration or null on failure.
 */
async function registerFirebaseServiceWorker(
  serviceWorkerPath = '/firebase-messaging-sw.js',
  serviceWorkerScope = '/'
): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    console.warn('[WebPush] Service workers not supported in this browser.');
    return null;
  }
  try {
    // Re-use an already active registration if available
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
    console.log('[WebPush] Firebase service worker registered:', registration.scope);
    return registration;
  } catch (err) {
    console.warn('[WebPush] Failed to register Firebase service worker:', err);
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
    const swRegistration = await registerFirebaseServiceWorker(
      options.serviceWorkerPath,
      options.serviceWorkerScope
    );

    const token = await getToken(messaging, {
      vapidKey:
        options.vapidPublicKey || (import.meta as any).env?.VITE_VAPID_PUBLIC_KEY,
      ...(swRegistration ? { serviceWorkerRegistration: swRegistration } : {}),
    });

    if (token) {
      console.log('[WebPush] FCM Token obtained:', token.substring(0, 15) + '...');
      return token;
    } else {
      console.warn(
        '[WebPush] No registration token available. Request permission to generate one.'
      );
      return null;
    }
  } catch (error) {
    console.warn('[WebPush] An error occurred while retrieving FCM token:', error);
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
    console.warn('[WebPush] Push notification permission denied');
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
  handler: (payload: MessagePayload) => void
): () => void {
  return onMessage(messaging, handler);
}
