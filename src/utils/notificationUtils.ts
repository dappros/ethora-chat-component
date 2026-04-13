import { buildNotificationUrl, PushPayloadLike } from './notificationPolicy';

/**
 * showBrowserNotification()
 * Triggers a native browser notification.
 * @param title - The notification title.
 * @param options - Standard NotificationOptions plus Ethora-specific data.
 * @param serviceWorkerScope - Optional SW scope for better integration.
 */
export async function showBrowserNotification(
  title: string,
  options: NotificationOptions & { data?: any },
  serviceWorkerScope = '/',
  onClick?: (event: Event) => void
): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  try {
    const notif = new Notification(title, options);
    if (onClick) {
      notif.onclick = (e) => {
        onClick(e);
        window.focus();
      };
    }
  } catch (err) {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration(serviceWorkerScope);
      if (registration) {
        await registration.showNotification(title, options);
      }
    }
  }
}

/**
 * Helper to extract common data from a message/payload for browser notifications.
 */
export function getBrowserNotificationData(
  payload: PushPayloadLike,
  origin: string
) {
  const data = payload?.data ?? {};
  const title = payload.notification?.title || data.title || 'New message';
  const body = payload.notification?.body || data.body || 'You have a new message.';
  const url = buildNotificationUrl(payload, origin);
  
  return {
    title,
    body,
    url,
    icon: payload.notification?.image || '/favicon.ico',
    badge: '/favicon.ico',
    tag: 'ethora-notification',
  };
}
