# Ethora Chat Component (`@ethora/chat-component`)

![GitHub watchers](https://img.shields.io/github/watchers/dappros/ethora-chat-component) ![GitHub forks](https://img.shields.io/github/forks/dappros/ethora-chat-component) ![GitHub Repo stars](https://img.shields.io/github/stars/dappros/ethora-chat-component) ![GitHub repo size](https://img.shields.io/github/repo-size/dappros/ethora-chat-component) ![GitHub language count](https://img.shields.io/github/languages/count/dappros/ethora-chat-component) ![GitHub top language](https://img.shields.io/github/languages/top/dappros/ethora-chat-component) <a href="https://codeclimate.com/github/dappros/ethora-chat-component/maintainability"><img src="https://api.codeclimate.com/v1/badges/715c6f3ffb08de5ca621/maintainability" /></a> ![GitHub commit activity (branch)](https://img.shields.io/github/commit-activity/m/dappros/ethora-chat-component/main) ![GitHub issues](https://img.shields.io/github/issues/dappros/ethora-chat-component) ![GitHub closed issues](https://img.shields.io/github/issues-closed-raw/dappros/ethora-chat-component) ![GitHub](https://img.shields.io/github/license/dappros/ethora-chat-component) ![GitHub contributors](https://img.shields.io/github/contributors/dappros/ethora-chat-component)

![JavaScript](https://img.shields.io/badge/javascript-%23323330.svg?style=flat&logo=javascript&logoColor=%23F7DF1E)
![React](https://img.shields.io/badge/react-%2320232a.svg?style=flat&logo=react&logoColor=%2361DAFB) ![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=flat&logo=typescript&logoColor=white) ![JWT](https://img.shields.io/badge/JWT-black?style=flat&logo=JSON%20web%20tokens)

[![Discord](https://img.shields.io/badge/%3Cethora%3E-%237289DA.svg?style=flat&logo=discord&logoColor=white)](https://discord.gg/Sm6bAHA3ZC) [![Twitter URL](https://img.shields.io/twitter/url?url=https%3A%2F%2Fgithub.com%2Fdappros%2Fethora)](https://twitter.com/intent/tweet?url=https%3A%2F%2Fgithub.com%2Fdappros%2Fethora%2F&via=tarasfilatov&text=check%20out%20Ethora%20%23web3%20%23social%20app%20engine&hashtags=lowcode%2Creactnative%2Copensource%2Cnocode) [![Website](https://img.shields.io/website?url=https%3A%2F%2Fethora.com%2F)](https://ethora.com/) [![YouTube Channel Subscribers](https://img.shields.io/youtube/channel/subscribers/UCRvrXwMOU0WBkRZyFlU7V_g)](https://www.youtube.com/channel/UCRvrXwMOU0WBkRZyFlU7V_g)

React + TypeScript chat UI component powered by Ethora backend APIs and XMPP.  
Use it as a standalone chat page, as an embedded widget in your existing app, or as a customizable chat foundation with your own auth and UI.

## Table of Contents

- [Overview](#overview)
- [Why Ethora](#why-ethora)
- [Quick Start](#quick-start)
- [Integration Modes](#integration-modes)
- [Behavior Notes and Legacy Quirks](#behavior-notes-and-legacy-quirks)
- [Chat Props Reference](#chat-props-reference)
- [Full Config Reference (`IConfig`)](#full-config-reference-iconfig)
- [Custom Widgets and Overrides](#custom-widgets-and-overrides)
- [Push Notifications](#push-notifications)
- [Auth Strategies](#auth-strategies)
- [Hooks and API Exports](#hooks-and-api-exports)
- [Use Cases and Feature Coverage](#use-cases-and-feature-coverage)
- [Hosted vs Self-Host Guidance](#hosted-vs-self-host-guidance)
- [Security Notes](#security-notes)
- [Reference Architectures](#reference-architectures)
- [Use-Case Templates](#use-case-templates)
- [Feature Roadmap Snapshot](#feature-roadmap-snapshot)
- [Troubleshooting](#troubleshooting)
- [Ethora Links and Support](#ethora-links-and-support)

## Overview

`@ethora/chat-component` gives you a production-oriented chat interface with:

- Room list and room chat UI
- Message history, replies, reactions, edits, deletes
- Typing indicators
- In-app notifications + Web Push integration
- Configurable auth modes (default/login form/google/jwt/custom user)
- Custom render components for message/input/scroll/day separator/new-message label

The package exports:

- `Chat` (main component)
- `XmppProvider`
- `useUnread`
- `logoutService`
- `useQRCodeChat`, `handleQRChatId`
- `useInAppNotifications`
- `usePushNotifications`
- `resendMessage`

## Why Ethora

Ethora provides hosted and customizable messaging infrastructure plus a wider product ecosystem.

| Dimension | Ethora Chat Component | Full Ethora Platform |
| --- | --- | --- |
| Primary goal | Embed chat quickly in a React app | End-to-end product stack (chat, profiles, wallets, AI, admin) |
| Time to first chat | Minutes | Higher initial setup, broader capabilities |
| Frontend scope | Focused web chat UI package | Multi-product ecosystem and broader SDK/tooling |
| Custom UI control | High via props + custom components | High, with additional platform-specific tooling |
| Best fit | Support chat, portal messaging, embedded chat widget | Full social/messaging app platforms with extended modules |

## Quick Start

### 1. Install

| Tool | Command |
| --- | --- |
| npm | `npm i @ethora/chat-component` |
| yarn | `yarn add @ethora/chat-component` |
| pnpm | `pnpm add @ethora/chat-component` |
| bun | `bun add @ethora/chat-component` |

### 2. Render the chat

```tsx
import { Chat, XmppProvider } from '@ethora/chat-component';
import './App.css';

export default function App() {
  return (
    <XmppProvider>
      <Chat />
    </XmppProvider>
  );
}
```

### Required wrapper (`XmppProvider`)

`Chat` relies on internals that use `useXmppClient()`. In real integrations, wrap `Chat` (or your entire app shell) with `XmppProvider`:

```tsx
import { Chat, XmppProvider } from '@ethora/chat-component';

export default function App() {
  return (
    <XmppProvider>
      <Chat config={{ baseUrl: 'https://api.ethoradev.com/v1' }} />
    </XmppProvider>
  );
}
```

### 3. Run

```bash
npm run dev
```

Open `http://localhost:5173`.

## Integration Modes

All modes below assume `XmppProvider` wraps `Chat`.

### A) Minimal demo mode (provider + chat)

```tsx
<XmppProvider>
  <Chat />
</XmppProvider>
```

Useful for local proof-of-concept and quick UI validation.

### B) Auto default credential fallback (legacy behavior)

If no `googleLogin`, no `jwtLogin`, no `userLogin`, and no `defaultLogin`, `LoginWrapper` currently triggers internal email/password fallback logic.

```tsx
<XmppProvider>
  <Chat config={{ colors: { primary: '#2563eb', secondary: '#dbeafe' } }} />
</XmppProvider>
```

### C) Explicit email/password via `user` prop

```tsx
<XmppProvider>
  <Chat
    user={{
      email: 'user@example.com',
      password: 'PLACEHOLDER_PASSWORD',
    }}
  />
</XmppProvider>
```

### D) Injected logged-in user (`userLogin`)

```tsx
<XmppProvider>
  <Chat
    config={{
      userLogin: {
        enabled: true,
        user: {
          _id: 'PLACEHOLDER_USER_ID',
          appId: 'PLACEHOLDER_APP_ID',
          walletAddress: 'PLACEHOLDER_WALLET_ADDRESS',
          defaultWallet: { walletAddress: 'PLACEHOLDER_WALLET_ADDRESS' },
          firstName: 'Jane',
          lastName: 'Doe',
          xmppPassword: 'PLACEHOLDER_XMPP_PASSWORD',
          token: 'PLACEHOLDER_ACCESS_TOKEN',
          refreshToken: 'PLACEHOLDER_REFRESH_TOKEN',
          username: 'PLACEHOLDER_USERNAME',
        },
      },
    }}
  />
</XmppProvider>
```

### E) JWT login

```tsx
<XmppProvider>
  <Chat
    config={{
      jwtLogin: {
        enabled: true,
        token: 'PLACEHOLDER_JWT_TOKEN',
      },
    }}
  />
</XmppProvider>
```

### F) Google login

```tsx
<XmppProvider>
  <Chat
    config={{
      googleLogin: {
        enabled: true,
        firebaseConfig: {
          apiKey: 'PLACEHOLDER_API_KEY',
          authDomain: 'PLACEHOLDER_AUTH_DOMAIN',
          projectId: 'PLACEHOLDER_PROJECT_ID',
          storageBucket: 'PLACEHOLDER_STORAGE_BUCKET',
          messagingSenderId: 'PLACEHOLDER_MESSAGING_SENDER_ID',
          appId: 'PLACEHOLDER_APP_ID',
        },
      },
    }}
  />
</XmppProvider>
```

### G) Single-room entry + URL/QR behavior

```tsx
<XmppProvider>
  <Chat
    roomJID="ROOM_JID@conference.xmpp.ethoradev.com"
    config={{
      setRoomJidInPath: true,
      qrUrl: 'https://your-app.example/chat/?qrChatId=',
    }}
  />
</XmppProvider>
```

`roomJID` forces entry room.  
`setRoomJidInPath` syncs room identity to URL path.  
`useQRCodeChat` / `handleQRChatId` support QR/deep-link room opening.

## Behavior Notes and Legacy Quirks

- `newArch` is now default-on. If omitted, runtime uses new architecture paths.
- Old architecture is used only when you explicitly set `config.newArch = false`.
- `defaultLogin` currently has legacy inverted behavior in `LoginWrapper`:
  - internal fallback login runs when login modes are not configured and `defaultLogin` is not set.
  - keep this in mind when migrating; prefer explicit `userLogin` / `jwtLogin` / `googleLogin`.

## Chat Props Reference

These are the top-level props accepted by `Chat` (exported from `ReduxWrapper`).

| Prop | Type | Required | Notes |
| --- | --- | --- | --- |
| `config` | `IConfig` | No | Main behavior/configuration object. |
| `roomJID` | `string` | No | Force specific room JID on load. |
| `user` | `{ email: string; password: string }` | No | Credentials for email/password login helper path. |
| `loginData` | `{ email: string; password: string }` | No | Optional login payload. |
| `MainComponentStyles` | `React.CSSProperties` | No | Outer container style override. |
| `token` | `string` | No | Optional token input (legacy/integration-specific usage). |
| `CustomMessageComponent` | `React.ComponentType<MessageProps>` | No | Replace message bubble rendering. |
| `CustomInputComponent` | `React.ComponentType<SendInputProps & { onSendMessage?; onSendMedia?; placeholderText?; }>` | No | Replace chat input area. |
| `CustomScrollableArea` | `React.ComponentType<CustomScrollableAreaProps>` | No | Replace list/scroll wrapper behavior. |
| `CustomDaySeparator` | `React.ComponentType<DaySeparatorProps>` | No | Replace day separator node. |
| `CustomNewMessageLabel` | `React.ComponentType<NewMessageLabelProps>` | No | Replace "new message" marker. |

## Full Config Reference (`IConfig`)

Below is a grouped reference for all `config` options.

### Core

| Option | Type | Description |
| --- | --- | --- |
| `appId` | `string` | App identifier for backend context. |
| `baseUrl` | `string` | API base URL (default project uses `https://api.ethoradev.com/v1`). |
| `customAppToken` | `string` | Custom app token for API initialization. |
| `xmppSettings` | `{ devServer; host; conference?; xmppPingOnSendEnabled? }` | XMPP connectivity settings. |
| `initBeforeLoad` | `boolean` | Initialize XMPP before normal chat load flow. |
| `clearStoreBeforeInit` | `boolean` | Clear local store before initialization. |
| `newArch` | `boolean` | Defaults to `true`; set `false` to explicitly force legacy/old architecture paths. |
| `useStoreConsoleEnabled` | `boolean` | Enable verbose internal logging in console. |

### UI and Layout

| Option | Type | Description |
| --- | --- | --- |
| `disableHeader` | `boolean` | Hide chat header. |
| `disableMedia` | `boolean` | Disable media sending/processing paths. |
| `disableRooms` | `boolean` | Hide/disable room list area. |
| `disableRoomMenu` | `boolean` | Disable room menu controls. |
| `disableRoomConfig` | `boolean` | Disable room configuration actions. |
| `disableNewChatButton` | `boolean` | Hide new chat/create room action. |
| `disableUserCount` | `boolean` | Hide user count in header/UI. |
| `disableChatInfo` | `{ disableHeader?; disableDescription?; disableType?; disableMembers?; hideMembers?; disableChatHeaderMenu? }` | Fine-grained chat info panel toggles. |
| `chatHeaderBurgerMenu` | `boolean` | Toggle burger menu in chat header. |
| `chatHeaderSettings` | `{ hide?; disableCreate?; disableMenu?; hideSearch? }` | Additional header-level controls. |
| `chatHeaderAdditional` | `{ enabled: boolean; element: any }` | Inject custom element into header area. |
| `headerLogo` | `string \| React.ReactElement` | Custom logo in header. |
| `headerMenu` | `() => void` | Custom menu handler. |
| `headerChatMenu` | `() => void` | Custom room header menu handler. |
| `colors` | `{ primary: string; secondary: string }` | Theme colors for component UI. |
| `roomListStyles` | `React.CSSProperties` | Styles for room list pane. |
| `chatRoomStyles` | `React.CSSProperties` | Styles for chat pane. |
| `backgroundChat` | `{ color?: string; image?: string \| File }` | Chat background customization. |
| `bubleMessage` | `MessageBubble` | Bubble-level style overrides (as defined in types). |
| `setRoomJidInPath` | `boolean` | Sync room JID to URL path. |
| `qrUrl` | `string` | Base URL for QR deep link behavior. |

### Auth and Identity

| Option | Type | Description |
| --- | --- | --- |
| `defaultLogin` | `boolean` | Legacy quirk: current runtime fallback behavior is inverted; see Behavior Notes section. |
| `googleLogin` | `{ enabled: boolean; firebaseConfig: FBConfig }` | Google login support via Firebase config. |
| `jwtLogin` | `{ token: string; enabled: boolean; handleBadlogin?: React.ReactElement }` | Log user in using JWT exchange flow. |
| `userLogin` | `{ enabled: boolean; user: User \| null }` | Inject already-authenticated user directly. |
| `customLogin` | `{ enabled: boolean; loginFunction: () => Promise<User \| null> }` | Provide your custom async login function. |
| `refreshTokens` | `{ enabled: boolean; refreshFunction?: () => Promise<{ accessToken: string; refreshToken?: string } \| null> }` | Token refresh strategy. |

### Rooms and Data

| Option | Type | Description |
| --- | --- | --- |
| `defaultRooms` | `ConfigRoom[]` | Seed/default rooms. |
| `customRooms` | `{ rooms: PartialRoomWithMandatoryKeys[]; disableGetRooms?: boolean; singleRoom: boolean }` | Fully controlled room source. |
| `forceSetRoom` | `boolean` | Force room setup path in init flow. |
| `enableRoomsRetry` | `{ enabled: boolean; helperText: string }` | Enable retry UX when rooms fail to load. |

### Messaging and Interactions

| Option | Type | Description |
| --- | --- | --- |
| `disableInteractions` | `boolean` | Disable message interaction menu/actions. |
| `disableProfilesInteractions` | `boolean` | Disable profile interactions from chat UI. |
| `disableSentLogic` | `boolean` | Disable default sent-state logic when needed. |
| `secondarySendButton` | `{ enabled: boolean; messageEdit: string; label?: React.ReactNode; buttonStyles?: React.CSSProperties; hideInputSendButton?: boolean; overwriteEnterClick?: true }` | Extra send action/button config. |
| `botMessageAutoScroll` | `boolean` | Force auto-scroll behavior on bot messages. |
| `messageTextFilter` | `{ enabled: boolean; filterFunction: (text: string) => string }` | Transform/filter outgoing message text. |
| `eventHandlers` | `{ onMessageSent?; onMessageFailed?; onMessageEdited? }` | Lifecycle callbacks for message operations. |
| `translates` | `{ enabled: boolean; translations?: Iso639_1Codes }` | Message translation-related options. |
| `whitelistSystemMessage` | `string[]` | Restrict/render only selected system message types. |
| `customSystemMessage` | `React.ComponentType<MessageProps>` | Replace system message component renderer. |

### Typing and Sending Control

| Option | Type | Description |
| --- | --- | --- |
| `disableTypingIndicator` | `boolean` | Disable typing indicator UI logic. |
| `customTypingIndicator` | `{ enabled: boolean; text?: string \| ((usersTyping: string[]) => string); position?: 'bottom' \| 'top' \| 'overlay' \| 'floating'; styles?: React.CSSProperties; customComponent?: React.ComponentType<{ usersTyping: string[]; text: string; isVisible: boolean; }> }` | Customize typing indicator content and rendering. |
| `blockMessageSendingWhenProcessing` | `boolean \| { enabled: boolean; timeout?: number; onTimeout?: (roomJID: string) => void }` | Gate sends while processing in-flight state. |

### Notifications

| Option | Type | Description |
| --- | --- | --- |
| `inAppNotifications` | `{ enabled?; showInContext?; position?; maxNotifications?; duration?; onClick?; customComponent? }` | In-app toast notification behavior and custom rendering. |

### Push

| Option | Type | Description |
| --- | --- | --- |
| `pushNotifications.enabled` | `boolean` | Enable browser push subscription flow. |
| `pushNotifications.vapidPublicKey` | `string` | VAPID public key for push registration. |
| `pushNotifications.firebaseConfig` | `FBConfig` | Firebase app config for push messaging. |
| `pushNotifications.serviceWorkerPath` | `string` | Service worker path, default `/firebase-messaging-sw.js`. |
| `pushNotifications.serviceWorkerScope` | `string` | Service worker scope, default `/`. |
| `pushNotifications.softAsk` | `boolean` | Do not immediately trigger browser permission prompt. |

## Custom Widgets and Overrides

You can replace key UI parts without forking the package.

| Override prop | Purpose |
| --- | --- |
| `CustomMessageComponent` | Fully custom message bubble/row rendering. |
| `CustomInputComponent` | Custom composer and send controls. |
| `CustomScrollableArea` | Custom scroll/list container (virtualized or custom behavior). |
| `CustomDaySeparator` | Custom date separator component. |
| `CustomNewMessageLabel` | Custom "new message" divider label. |

Example:

```tsx
import { Chat } from '@ethora/chat-component';
import CustomMessageBubble from './CustomMessageBubble';
import CustomChatInput from './CustomChatInput';
import CustomScrollableArea from './CustomScrollableArea';
import CustomDaySeparator from './CustomDaySeparator';
import CustomNewMessageLabel from './CustomNewMessageLabel';

export default function App() {
  return (
    <Chat
      CustomMessageComponent={CustomMessageBubble}
      CustomInputComponent={CustomChatInput}
      CustomScrollableArea={CustomScrollableArea}
      CustomDaySeparator={CustomDaySeparator}
      CustomNewMessageLabel={CustomNewMessageLabel}
      config={{
        colors: { primary: '#1d4ed8', secondary: '#dbeafe' },
      }}
    />
  );
}
```

Reference example components in repository:

- `src/examples/customComponents/CustomMessageBubble.tsx`
- `src/examples/customComponents/CustomChatInput.tsx`
- `src/examples/customComponents/CustomScrollableArea.tsx`
- `src/examples/customComponents/CustomDaySeparator.tsx`
- `src/examples/customComponents/CustomNewMessageLabel.tsx`

## Push Notifications

### Prerequisites

| Requirement | Why |
| --- | --- |
| HTTPS origin (or localhost) | Browser push APIs require secure contexts. |
| Firebase project | FCM token + push transport setup. |
| VAPID public key | Required for web push subscription. |
| Service worker file | Required for background notification handling. |

### Setup steps

1. Copy service worker into your app's public assets:

```bash
npx @ethora/chat-component ethora-chat
```

2. Configure push in `config`:

```tsx
<Chat
  config={{
    pushNotifications: {
      enabled: true,
      vapidPublicKey: 'PLACEHOLDER_VAPID_PUBLIC_KEY',
      firebaseConfig: {
        apiKey: 'PLACEHOLDER_API_KEY',
        authDomain: 'PLACEHOLDER_AUTH_DOMAIN',
        projectId: 'PLACEHOLDER_PROJECT_ID',
        storageBucket: 'PLACEHOLDER_STORAGE_BUCKET',
        messagingSenderId: 'PLACEHOLDER_MESSAGING_SENDER_ID',
        appId: 'PLACEHOLDER_APP_ID',
      },
      serviceWorkerPath: '/firebase-messaging-sw.js',
      serviceWorkerScope: '/',
      softAsk: false,
    },
  }}
/>
```

3. Optional: use hook directly for controlled permission flow:

```tsx
import { usePushNotifications } from '@ethora/chat-component';

function PushPermissionButton() {
  const { requestPermission } = usePushNotifications({
    enabled: true,
    softAsk: true,
    vapidPublicKey: 'PLACEHOLDER_VAPID_PUBLIC_KEY',
  });

  return <button onClick={() => requestPermission()}>Enable Push</button>;
}
```

## Auth Strategies

| Strategy | Config shape | Best for |
| --- | --- | --- |
| Default fallback (legacy quirk) | no auth block / `defaultLogin` | Legacy/demo flows; prefer explicit auth modes in production |
| Injected user | `userLogin: { enabled: true, user }` | App already has authenticated user/session |
| JWT login | `jwtLogin: { enabled: true, token }` | Token-based backend auth flow |
| Google login | `googleLogin: { enabled: true, firebaseConfig }` | Google SSO using Firebase |
| Custom login function | `customLogin: { enabled: true, loginFunction }` | Fully custom identity provider |

### Example: injected user (bypass login screen)

```tsx
<Chat
  config={{
    userLogin: {
      enabled: true,
      user: {
        _id: 'PLACEHOLDER_USER_ID',
        appId: 'PLACEHOLDER_APP_ID',
        walletAddress: 'PLACEHOLDER_WALLET_ADDRESS',
        defaultWallet: { walletAddress: 'PLACEHOLDER_WALLET_ADDRESS' },
        firstName: 'Jane',
        lastName: 'Doe',
        xmppPassword: 'PLACEHOLDER_XMPP_PASSWORD',
        token: 'PLACEHOLDER_ACCESS_TOKEN',
        refreshToken: 'PLACEHOLDER_REFRESH_TOKEN',
        username: 'PLACEHOLDER_USERNAME',
      },
    },
  }}
/>
```

### Example: JWT login

```tsx
<Chat
  config={{
    jwtLogin: {
      enabled: true,
      token: 'PLACEHOLDER_JWT_TOKEN',
    },
    refreshTokens: {
      enabled: true,
      refreshFunction: async () => {
        return {
          accessToken: 'PLACEHOLDER_NEW_ACCESS_TOKEN',
          refreshToken: 'PLACEHOLDER_NEW_REFRESH_TOKEN',
        };
      },
    },
  }}
/>
```

## Hooks and API Exports

| Export | Type | Purpose |
| --- | --- | --- |
| `Chat` | React component | Main chat component. |
| `XmppProvider` | React provider | Provides XMPP client context for internal hooks/state. |
| `useUnread` | hook | Returns unread counters. |
| `logoutService` | service | Programmatic logout utility. |
| `useQRCodeChat` | hook | Handle QR-based room links. |
| `handleQRChatId` | function | Parse/process QR chat ID from URL. |
| `useInAppNotifications` | hook | Enables and handles in-app notifications. |
| `usePushNotifications` | hook | Push subscription + foreground handling workflow. |
| `resendMessage` | function | Retry sending failed/pending messages. |

Basic hook usage:

```tsx
import { useUnread, logoutService } from '@ethora/chat-component';

function HeaderActions() {
  const { totalCount } = useUnread();

  return (
    <div>
      <span>Unread: {totalCount}</span>
      <button onClick={() => logoutService.performLogout()}>Logout</button>
    </div>
  );
}
```

`logoutService.performLogout()` behavior:

- Dispatches `chatSettingStore/logout`
- Dispatches `rooms/setLogoutState`
- Dispatches `roomHeap/clearHeap`
- Triggers logout middleware, which emits `ethora-xmpp-logout`
- `XmppProvider` listens to that event and disconnects active XMPP client

## Use Cases and Feature Coverage

| Area | Status in this package |
| --- | --- |
| One-room embedded chat | Available |
| Multi-room chat UI | Available |
| Message interactions (reply/copy/edit/delete/report/reactions) | Available |
| Typing indicator | Available |
| Profile interactions in chat | Available (can be disabled) |
| File/media attachments | Available with ongoing enhancements |
| In-app notifications | Available |
| Web push notifications | Available |
| Wallet/assets and extended social modules | Primarily in full Ethora platform |

## Hosted vs Self-Host Guidance

| Model | Best for | Pros | Tradeoffs |
| --- | --- | --- | --- |
| Hosted Ethora backend | Fast time-to-market, smaller teams, MVPs | Fast setup, managed backend operations, easier push/auth onboarding | Less infrastructure-level control |
| Self-hosted Ethora stack | Regulated environments, deep infra control | Full control over infrastructure, compliance customization, internal network deployment options | Higher DevOps/maintenance overhead |
| Hybrid | Gradual migration or split workloads | Can start fast and migrate critical paths later | More architecture complexity |


## Feature Roadmap

This is a practical planning snapshot for cross-platform consumers. It is not a release commitment.

| Surface | Current state | Notes |
| --- | --- | --- |
| Web React (`@ethora/chat-component`) | Available now | This repository. |
| React Native | Via broader Ethora stack | Track platform-specific implementation in Ethora repos/docs. |
| Swift (iOS native) | Planned / ecosystem-level | Confirm status with Ethora team for production timelines. |
| Kotlin (Android native) | Planned / ecosystem-level | Confirm status with Ethora team for production timelines. |
| Flutter | Planned / ecosystem-level | Confirm status with Ethora team for production timelines. |
| Additional roadmap items | Ongoing | Media improvements, richer profile/wallet experiences, broader integration guides. |

## Troubleshooting

| Issue | Likely cause | Fix |
| --- | --- | --- |
| `useXmppClient must be used within an XmppProvider` | Using internal XMPP-dependent logic without provider context | Wrap the app tree with `XmppProvider` where needed. |
| Chat loads but no rooms appear | Auth/app context mismatch or room fetching restrictions | Verify `appId`, user credentials/tokens, `baseUrl`, and `customRooms` settings. |
| Push permission never appears | `softAsk: true` without manual trigger, insecure origin, or missing VAPID key | Trigger `requestPermission()`, use HTTPS/localhost, set valid VAPID key. |
| Service worker not found | `firebase-messaging-sw.js` missing in public dir | Run `npx @ethora/chat-component ethora-chat` or copy file manually. |
| Login loop / auth failure | Wrong token/user object shape | Validate `jwtLogin`, `userLogin.user`, and refresh token flow. |

## Ethora Links and Support
### Product

- Website: https://ethora.com/
- Try Ethora: https://app.ethora.com/register

### Developer Docs

- Chat component docs: https://docs.ethora.com/
- Ethora GitHub hub: https://github.com/dappros/ethora
- This package repo: https://github.com/dappros/ethora-chat-component
- Ethora GitHub organization: https://github.com/dappros
- API docs (public): https://app.dappros.com/api-docs/
- API docs (environment used in this repo): https://api.ethoradev.com/api-docs

### Community and Support

- Forum: https://forum.ethora.com/
- Discord: https://discord.gg/Sm6bAHA3ZC
- Contact: https://ethora.com/#contact

## License

AGPL. See [LICENSE.txt](./LICENSE.txt).
