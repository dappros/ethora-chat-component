import { messaging } from '../firebase-config';
import { getToken } from 'firebase/messaging';

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

/**
 * getFCMToken()
 * Obtains the FCM registration token for the current device/browser.
 * @param vapidPublicKey - The VAPID Public Key from Firebase Console.
 * @returns The FCM token or null if failed.
 */
export async function getFCMToken(vapidPublicKey?: string): Promise<string | null> {
  try {
    const token = await getToken(messaging, {
      vapidKey: vapidPublicKey || (import.meta as any).env?.VITE_VAPID_PUBLIC_KEY,
    });
    
    if (token) {
      console.log('[WebPush] FCM Token obtained:', token);
      return token;
    } else {
      console.warn('[WebPush] No registration token available. Request permission to generate one.');
      return null;
    }
  } catch (error) {
    console.error('[WebPush] An error occurred while retrieving token:', error);
    return null;
  }
}

/**
 * initPushNotifications()
 * Orchestrates the full push initialization flow.
 * @returns The FCM token if successful.
 */
export async function initPushNotifications(vapidPublicKey?: string): Promise<string | null> {
  const hasPermission = await requestNotificationPermission();
  
  if (!hasPermission) {
    console.error('[WebPush] Push notification permission denied');
    return null;
  }

  const token = await getFCMToken(vapidPublicKey);
  return token;
}
