import React, { useCallback, useEffect, useState } from 'react';
import { IConfig } from '../../types/types';
import { resolveIconColor } from '../../helpers/resolveIconColor';

type PermissionState = NotificationPermission | 'unsupported';

const DISMISS_KEY = '@ethora/chat-component:notifBannerDismissed';

const readPermission = (): PermissionState => {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return 'unsupported';
  }
  return Notification.permission;
};

/**
 * Whether web push can technically work in this environment. When it can't,
 * prompting for permission leads nowhere, so the banner is suppressed entirely.
 * Needs: the Notification API, a secure context (https; localhost counts), and
 * service-worker support. SSR-safe.
 */
const isPushCapable = (): boolean => {
  if (typeof window === 'undefined') return false;
  if (typeof Notification === 'undefined') return false;
  if (!window.isSecureContext) return false;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return false;
  }
  return true;
};

const POSITION_STYLE: Record<
  NonNullable<
    NonNullable<
      NonNullable<IConfig['pushNotifications']>['permissionBanner']
    >['position']
  >,
  React.CSSProperties
> = {
  'top-left': { top: 16, left: 16 },
  'top-right': { top: 16, right: 16 },
  'top-center': { top: 16, left: '50%', transform: 'translateX(-50%)' },
  'bottom-left': { bottom: 16, left: 16 },
  'bottom-right': { bottom: 16, right: 16 },
  'bottom-center': { bottom: 16, left: '50%', transform: 'translateX(-50%)' },
};

interface NotificationPermissionBannerProps {
  config?: IConfig;
  /** Triggers the browser permission prompt + push registration. */
  requestPermission: () => Promise<void>;
}

/**
 * In-app banner nudging the user to enable browser notifications. Fully
 * config-driven (config.pushNotifications.permissionBanner) and self-contained:
 * it reads the live Notification permission, renders the "enable" or "blocked"
 * variant accordingly, and hides itself when notifications are granted /
 * unsupported / disabled. SSR-safe.
 */
const NotificationPermissionBanner: React.FC<
  NotificationPermissionBannerProps
> = ({ config, requestPermission }) => {
  const banner = config?.pushNotifications?.permissionBanner;
  const pushEnabled = config?.pushNotifications?.enabled === true;

  const [permission, setPermission] = useState<PermissionState>(readPermission);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.sessionStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [busy, setBusy] = useState(false);

  // Keep the permission state live: the user can grant/deny via the prompt or
  // change it later in site settings (caught on focus / the Permissions API).
  useEffect(() => {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') {
      return;
    }
    const sync = () => setPermission(Notification.permission);
    sync();

    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);

    let permStatus: PermissionStatus | null = null;
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    if (nav?.permissions?.query) {
      nav.permissions
        .query({ name: 'notifications' as PermissionName })
        .then((status) => {
          permStatus = status;
          status.onchange = sync;
        })
        .catch(() => {
          /* Permissions API not available for notifications — focus covers it. */
        });
    }

    return () => {
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
      if (permStatus) permStatus.onchange = null;
    };
  }, []);

  const handleEnable = useCallback(async () => {
    setBusy(true);
    try {
      await requestPermission();
    } catch {
      /* swallow — permission state update below reflects the outcome */
    } finally {
      setPermission(readPermission());
      setBusy(false);
    }
  }, [requestPermission]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* sessionStorage unavailable (private mode) — dismiss for this mount. */
    }
  }, []);

  // ── Visibility gating ──────────────────────────────────────────────────
  if (!banner?.enabled || !pushEnabled) return null;
  // No banner where push can't work at all (insecure context, no SW, no API)
  // or where there's nothing to prompt (already granted).
  if (!isPushCapable() || permission === 'granted') return null;
  if (dismissed) return null;
  const isBlocked = permission === 'denied';
  // "blocked" is opt-in (default off): it can only be fixed via site settings,
  // so we don't nag by default. "default"/askable state shows unless opted out.
  if (isBlocked && banner.showWhenBlocked !== true) return null;
  if (!isBlocked && banner.showWhenDefault === false) return null;

  const accent = isBlocked ? '#F59E0B' : resolveIconColor(config);
  const dismissible = banner.dismissible !== false;
  const position = banner.position || 'bottom-right';

  const title = isBlocked
    ? banner.blockedTitle || 'Notifications are blocked'
    : banner.enableTitle || 'Enable notifications';
  const description = isBlocked
    ? banner.blockedDescription ||
      'To get message alerts, click the icon left of the address bar → Notifications → Allow, then reload.'
    : banner.enableDescription ||
      'Get notified about new messages even when this tab is closed.';
  const buttonLabel = banner.enableButtonLabel || 'Enable notifications';

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        zIndex: 2147483000,
        maxWidth: 340,
        width: 'calc(100% - 32px)',
        boxSizing: 'border-box',
        display: 'flex',
        gap: 12,
        padding: '14px 16px',
        background: '#FFFFFF',
        color: '#18181B',
        borderLeft: `4px solid ${accent}`,
        borderRadius: 10,
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.16)',
        fontFamily: 'var(--ethora-font-family, inherit)',
        ...POSITION_STYLE[position],
        ...banner.style,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.3 }}>
          {title}
        </div>
        <div
          style={{
            marginTop: 4,
            fontSize: 13,
            lineHeight: 1.4,
            color: '#71717A',
          }}
        >
          {description}
        </div>
        {!isBlocked && (
          <button
            type="button"
            onClick={() => void handleEnable()}
            disabled={busy}
            style={{
              marginTop: 12,
              width: '100%',
              padding: '9px 14px',
              border: 'none',
              borderRadius: 8,
              background: accent,
              color: '#FFFFFF',
              fontSize: 14,
              fontWeight: 600,
              cursor: busy ? 'progress' : 'pointer',
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? 'Requesting…' : buttonLabel}
          </button>
        )}
      </div>

      {dismissible && (
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss"
          title="Dismiss"
          style={{
            flex: '0 0 auto',
            alignSelf: 'flex-start',
            width: 22,
            height: 22,
            padding: 0,
            border: 'none',
            background: 'transparent',
            color: '#A1A1AA',
            fontSize: 18,
            lineHeight: '22px',
            cursor: 'pointer',
          }}
        >
          ×
        </button>
      )}
    </div>
  );
};

export default NotificationPermissionBanner;
