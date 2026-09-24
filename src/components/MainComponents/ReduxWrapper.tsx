import React, { useMemo } from 'react';
import { Provider, useDispatch } from 'react-redux';
import { store, persistor } from '../../roomStore';
import { setConfig } from '../../roomStore/chatSettingsSlice';
import { setE2eeEnabled } from '../../e2ee';
import { ConfigUser, IConfig } from '../../types/types';
import '../../index.css';
import '../../helpers/storeConsole';
import LoginWrapper from './LoginWrapper.tsx';
import { PersistGate } from 'redux-persist/integration/react';
import Loader from '../styled/Loader.tsx';
import { ToastProvider } from '../../context/ToastContext.tsx';
import { CustomComponentsProvider } from '../../context/CustomComponentsContext';
import { CustomComponentsContextValue } from '../../types/models/customComponents.model';
import { useInAppNotifications } from '../../hooks/useInAppNotifications';
import usePushNotifications from '../../hooks/usePushNotifications';
import NotificationPermissionBanner from '../Notification/NotificationPermissionBanner';
import { useTypography } from '../../hooks/useTypography';
import { applyThemeColors } from '../../helpers/resolveIconColor';
import {
  ThemeTokens,
  useResolvedColorScheme,
  useThemeTokenStyle,
} from '../../styles/tokens';
import { CHAT_ROOT_CLASS } from '../../styles/classNames';
import { useChatSettingState } from '../../hooks/useChatSettingState';
import ChatErrorBoundary from './ChatErrorBoundary';

// The chat's scoping root. Everything in `index.css` that is not itself
// `ethora-`-prefixed (scrollbars, base typography) is nested under
// `.ethora-chat-root`, so the stylesheet cannot reach the host page.
//
// It sits here rather than on <ChatWrapperBox> because ChatWrapper returns
// that box in only some of its branches: the login form, the loader and the
// fallback screens render outside it and would otherwise lose the chat's
// configured typography. ChatWrapperBox keeps its own copy of the class, so
// in the main shell the two nest; that is harmless for CSS scoping and keeps
// a host's `document.querySelector('.ethora-chat-root')` resolving to the
// outermost node.
//
// `display: contents` is deliberate: the element must be a real DOM node (so
// it can carry the class and act as a CSS ancestor) while contributing no box
// of its own. A normal <div> would break the height chain, since the host
// sizes whatever <Chat> renders and <ChatWrapperBox> is `height: 100%`.
const chatRootStyle: React.CSSProperties = { display: 'contents' };

// The outer root also carries the design tokens and the colour scheme:
// the loader, login form, fallback screens, toasts and the notification
// permission banner render here, above <ChatWrapperBox>. Custom properties
// inherit through a `display: contents` element like through any other.
const ChatRoot: React.FC<{
  config?: IConfig;
  children: React.ReactNode;
}> = ({ config, children }) => {
  // Props first, store second. <ChatWrapperBox> (the inner root) themes
  // itself from the STORE, so reading props only here meant the two roots
  // could disagree: a host that drives the chat by dispatching setConfig
  // instead of passing a `config` prop got a dark chat inside a light
  // shell (loader, login, fallback screens, toasts). Props keep priority
  // so the first paint still uses the authoritative value and nothing
  // flashes while ConfigEnabler is pushing it into the store.
  const { config: storeConfig } = useChatSettingState();
  const scheme = useResolvedColorScheme(
    config?.colorScheme ?? storeConfig?.colorScheme
  );
  const tokenStyle = useThemeTokenStyle(
    config?.colors ?? storeConfig?.colors,
    config?.typography ?? storeConfig?.typography,
    scheme
  );
  const style = useMemo(
    () => ({ ...tokenStyle, ...chatRootStyle }),
    [tokenStyle]
  );
  return (
    <div
      className={CHAT_ROOT_CLASS}
      style={style}
      data-ethora-color-scheme={scheme}
    >
      {children}
    </div>
  );
};

export interface ChatWrapperProps
  extends Pick<
    CustomComponentsContextValue,
    | 'CustomMessageComponent'
    | 'CustomInputComponent'
    | 'CustomScrollableArea'
    | 'CustomDaySeparator'
    | 'CustomNewMessageLabel'
  > {
  token?: string;
  roomJID?: string;
  user?: ConfigUser;
  loginData?: { email: string; password: string };
  MainComponentStyles?: React.CSSProperties;
  config?: IConfig;
}

const NotificationEnabler: React.FC = () => {
  useInAppNotifications();
  return null;
};

const TypographyEnabler: React.FC<{ config?: IConfig }> = ({ config }) => {
  useTypography(config?.typography);
  return null;
};

// Publish the host's config into the redux store as early as the chat mounts,
// rather than waiting for <ChatWrapper>.
//
// Two different things read "the config" and they used to disagree:
//   - applyThemeColors (below) reads the PROP, so CSS-variable theming was
//     live from the first paint;
//   - every component that calls resolveIconColor/resolveIconBgColor via
//     useChatSettingState (NoMessagesPlaceholder, ChatRoom, SendInput,
//     AudioRecorder, ...) reads the STORE.
//
// The store was only ever populated by useChatWrapperInit, which lives inside
// <ChatWrapper> - and LoginWrapper refuses to mount that until there's a
// logged-in user with xmpp credentials. Until then the store still held the
// slice's built-in default (`colors.primary: '#0052CD'`, Ethora's own brand
// blue), so those components rendered Ethora colours instead of the host's:
// briefly on a slow connect, and PERMANENTLY whenever login or the XMPP
// connection never completes - exactly the "empty chat placeholder and icons
// use Ethora's default colours" report.
//
// Dispatching here fixes both, and is safe: `config` is blacklisted from
// persistence, so nothing rehydrates over it, and useChatWrapperInit's own
// dispatch stays as-is (same value, and it still owns the cache-scope purge).
// Skipped when the host passes no config at all, so the slice default (which
// components dereference unguarded) is never replaced by undefined.
const ConfigEnabler: React.FC<{ config?: IConfig }> = ({ config }) => {
  const dispatch = useDispatch();
  React.useEffect(() => {
    if (!config) return;
    dispatch(setConfig(config));
  }, [config, dispatch]);
  // Kept out of the effect above so the flag is set even when `config` is
  // undefined: e2ee must then be off, not left at whatever a previous mount
  // put there.
  React.useEffect(() => {
    setE2eeEnabled(config?.e2ee?.enabled === true);
  }, [config?.e2ee?.enabled]);
  return null;
};

const ThemeColorsEnabler: React.FC<{ config?: IConfig }> = ({ config }) => {
  React.useEffect(() => {
    applyThemeColors(config);
  }, [
    config?.colors?.icons,
    config?.colors?.primary,
    config?.colors?.ownMessageBackground,
    config?.colors?.otherMessageBackground,
    config?.colors?.inputBackground,
    config?.backgroundChat?.color,
    config?.backgroundChat?.image,
  ]);
  return null;
};

const PushNotificationsEnabler: React.FC<{ config?: IConfig }> = ({
  config,
}) => {
  const { requestPermission } = usePushNotifications({
    enabled: config?.pushNotifications?.enabled,
    vapidPublicKey: config?.pushNotifications?.vapidPublicKey,
    firebaseConfig: config?.pushNotifications?.firebaseConfig,
    serviceWorkerPath: config?.pushNotifications?.serviceWorkerPath,
    serviceWorkerScope: config?.pushNotifications?.serviceWorkerScope,
    softAsk: config?.pushNotifications?.softAsk,
    onClick: config?.pushNotifications?.onClick,
  });
  return (
    <NotificationPermissionBanner
      config={config}
      requestPermission={requestPermission}
    />
  );
};

export const ReduxWrapper: React.FC<ChatWrapperProps> = React.memo(
  ({
    CustomMessageComponent,
    CustomInputComponent,
    CustomScrollableArea,
    CustomDaySeparator,
    CustomNewMessageLabel,
    ...props
  }) => {
    const memoizedConfig = useMemo(() => {
      if (!props.config) return props.config;

      return {
        ...props.config,
        newArch: props.config.newArch ?? true,
      };
    }, [props.config]);

    return (
      // <Provider> sits OUTSIDE the root element (the DOM is unchanged)
      // purely so ChatRoot can read the store, see its comment above.
      <Provider store={store}>
        <ChatRoot config={memoizedConfig}>
          {/* The SDK's crash barrier, as high as it goes while still being
            INSIDE the store provider: everything below it is what actually
            crashes in the field, and the default fallback screen reads the
            host's colours and locale out of redux to theme itself. Without
            it, one throw in the chat tree propagates to the HOST's root and
            unmounts the customer's whole app. */}
          <ChatErrorBoundary config={memoizedConfig} scope="chat">
            <PersistGate loading={<Loader />} persistor={persistor}>
              <ToastProvider>
                {/* No <MessageNotificationProvider> here: it now wraps the tree
                once, up in <XmppProvider>, so mounting a second one around
                <Chat> would double-handle every incoming message. */}
                <NotificationEnabler />
                <ConfigEnabler config={memoizedConfig} />
                <ThemeTokens config={memoizedConfig} />
                <TypographyEnabler config={memoizedConfig} />
                <ThemeColorsEnabler config={memoizedConfig} />
                <PushNotificationsEnabler config={memoizedConfig} />
                <CustomComponentsProvider
                  CustomMessageComponent={CustomMessageComponent}
                  CustomInputComponent={CustomInputComponent}
                  CustomScrollableArea={CustomScrollableArea}
                  CustomDaySeparator={CustomDaySeparator}
                  CustomNewMessageLabel={CustomNewMessageLabel}
                >
                  {/* `config` must come AFTER the spread: props still carries
                  the raw config, so spreading last silently overwrote
                  memoizedConfig and threw away its `newArch ?? true`
                  default (and would now throw away the same normalization
                  ConfigEnabler puts in the store, leaving prop and store
                  disagreeing again). */}
                  <LoginWrapper {...props} config={memoizedConfig} />
                </CustomComponentsProvider>
              </ToastProvider>
            </PersistGate>
          </ChatErrorBoundary>
        </ChatRoot>
      </Provider>
    );
  }
);
