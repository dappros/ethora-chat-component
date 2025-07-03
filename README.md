# Ethora Chat Component: a single npm for your React chat

![GitHub watchers](https://img.shields.io/github/watchers/dappros/ethora-chat-component) ![GitHub forks](https://img.shields.io/github/forks/dappros/ethora-chat-component) ![GitHub Repo stars](https://img.shields.io/github/stars/dappros/ethora-chat-component) ![GitHub repo size](https://img.shields.io/github/repo-size/dappros/ethora-chat-component) ![GitHub language count](https://img.shields.io/github/languages/count/dappros/ethora-chat-component) ![GitHub top language](https://img.shields.io/github/languages/top/dappros/ethora-chat-component) <a href="https://codeclimate.com/github/dappros/ethora-chat-component/maintainability"><img src="https://api.codeclimate.com/v1/badges/715c6f3ffb08de5ca621/maintainability" /></a> ![GitHub commit activity (branch)](https://img.shields.io/github/commit-activity/m/dappros/ethora-chat-component/main) ![GitHub issues](https://img.shields.io/github/issues/dappros/ethora-chat-component) ![GitHub closed issues](https://img.shields.io/github/issues-closed-raw/dappros/ethora-chat-component) ![GitHub](https://img.shields.io/github/license/dappros/ethora-chat-component) ![GitHub contributors](https://img.shields.io/github/contributors/dappros/ethora-chat-component)

![JavaScript](https://img.shields.io/badge/javascript-%23323330.svg?style=flat&logo=javascript&logoColor=%23F7DF1E)
![React](https://img.shields.io/badge/react-%2320232a.svg?style=flat&logo=react&logoColor=%2361DAFB) ![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=flat&logo=typescript&logoColor=white) ![JWT](https://img.shields.io/badge/JWT-black?style=flat&logo=JSON%20web%20tokens)

[![Discord](https://img.shields.io/badge/%3Cethora%3E-%237289DA.svg?style=flat&logo=discord&logoColor=white)](https://discord.gg/Sm6bAHA3ZC) [![Twitter URL](https://img.shields.io/twitter/url?url=https%3A%2F%2Fgithub.com%2Fdappros%2Fethora)](https://twitter.com/intent/tweet?url=https%3A%2F%2Fgithub.com%2Fdappros%2Fethora%2F&via=tarasfilatov&text=check%20out%20Ethora%20%23web3%20%23social%20app%20engine&hashtags=lowcode%2Creactnative%2Copensource%2Cnocode) [![Website](https://img.shields.io/website?url=https%3A%2F%2Fethora.com%2F)](https://ethora.com/) [![YouTube Channel Subscribers](https://img.shields.io/youtube/channel/subscribers/UCRvrXwMOU0WBkRZyFlU7V_g)](https://www.youtube.com/channel/UCRvrXwMOU0WBkRZyFlU7V_g)

[![Live Demo](https://img.shields.io/badge/demo-live-green?style=flat)](https://codesandbox.io/s/ethora-chat-component-demo)

## About Chat Component

Ethora Chat Component allows you to build a functioning chat room super quickly.
Sounds simple and is easy to build your app with.
Uses XMPP chat protocol and ejabberd chat server to provide your users with a seamless instant messaging experience.

Once you need more functionality however you will be pleasantly surprised. Our Ethora platform behind the chat component offers a plethora of functionalities around chat/social, user profiles, digital wallets, business documents exchange, digital collectables, web3 and AI bots. The history behind Chat Component is following. First, we have built a low-code "super app" engine called Ethora: https://github.com/dappros/ethora/ which we used to drastically speed up app development for our clients. Afterwards, we have open-sourced it for the benefit of other developers. Later on, we realized that whilst developers love what Ethora can do, many of them don't need such a complex engine with all bells and whistles but a steep learning curver. In most cases you're after a certain functionality (like a simple chat room) and you need it quick.

Enter Ethora Chat Component which allows you to quickly implement your chat room experience!

If / once you need additional functionalities you will have options like: (a) build them yourself on top of chat component; (b) peek into or use code from Ethora open-source monorepo https://github.com/dappros/ethora/ or (c) seek help from Ethora team or other developers at our forum: https://forum.ethora.com/ or Discord server: https://discord.gg/Sm6bAHA3ZC

Note: scroll below for use cases and functionality break down of this Chat Component.

## Proven in Real Projects & Customization Support

Ethora Chat Component is a production-ready solution, successfully used in more than 5 different commercial and open-source projects across various industries. Our team has deep experience integrating and customizing this component for a wide range of use cases—from social apps and enterprise messengers to support bots and community platforms.

**Need custom features or integration help?**
We can help you tailor the chat experience to your needs—UI/UX, authentication, integrations, bots, and more. Just [contact us](https://www.ethora.com/#contact) or join our [community forum](https://forum.ethora.com/) to discuss your requirements!

## Integration & Technical Requirements

- **XMPP Provider Required:**
  The chat component must be wrapped in an `XmppProvider` for initialization and context. This is essential for all XMPP operations.

  **Best Practice:**

  > You can (and should) wrap your entire app with `XmppProvider` if you use chat features in multiple places. This ensures your app will utilize only one XMPP WebSocket connection, improving efficiency and resource usage.

  **Example: Wrapping your whole app**

  ```tsx
  import { XmppProvider } from '@ethora/chat-component';
  import App from './App';

  const config = {
    /* ...see config table below... */
  };

  export default function Root() {
    return (
      <XmppProvider config={config}>
        <App />
      </XmppProvider>
    );
  }
  ```

  **Example: Wrapping just the chat**

  ```tsx
  <XmppProvider config={config}>
    <Chat ...props />
  </XmppProvider>
  ```
  - If you wrap your whole app, all chat-related components will share the same XMPP connection and context.
  - If you only use chat in one place, you can wrap just the chat component.

- **Redux Store:**
  The component expects a Redux store with specific slices (`rooms`, `chatSettingStore`). If you use your own store, ensure compatibility or adapt the slices.
- **User Object Structure:**
  The user object (for login, config, etc.) must include fields like `xmppUsername`, `xmppPassword`, and optionally `defaultWallet`.
- **Room Object Structure:**
  Room objects must follow the `IRoom` interface, including `jid`, `name`, `members`, etc.
- **Logout Handling:**
  The component listens for a custom event (`ethora-xmpp-logout`) to disconnect the XMPP client. If you implement custom logout logic, dispatch this event to ensure proper cleanup.
- **Custom Message Rendering:**
  You can provide a custom message component via the `CustomMessageComponent` prop for full control over message bubble rendering.
- **Translations:**
  The `translates` config enables message translation and localization, supporting multiple languages.

## How to build your chat room in 5 minutes

1. Create a new Vite React project:
   ```bash
   npm create vite@latest
   # Follow prompts (choose React + TypeScript or JavaScript)
   cd your-project-name
   npm install
   ```
2. Install the Ethora chat component:
   ```bash
   npm install @ethora/chat-component
   ```
3. Add your Ethora/Firebase config (for Google SSO) or use default login for quick start.
4. Replace your `src/App.tsx` with the following minimal example:

   ```tsx
   import { XmppProvider, Chat } from '@ethora/chat-component';
   import './App.css';

   // Minimal config for demo/testing (see README for full options)
   const config = {
     defaultLogin: true, // For demo/testing, disables login screen
     colors: { primary: '#4287f5', secondary: '#42f5e9' },
     // For production, use googleLogin, jwtLogin, or userLogin
     // googleLogin: { enabled: true, firebaseConfig: { ... } },
   };

   function App() {
     return (
       <XmppProvider config={config}>
         <Chat
           MainComponentStyles={{
             width: '100%',
             height: '500px',
             borderRadius: '16px',
           }}
           // Optionally: CustomMessageComponent={MyCustomMessage}
         />
       </XmppProvider>
     );
   }

   export default App;
   ```

5. Start your app:
   ```bash
   npm run dev
   ```
6. Open http://localhost:5173/ in your browser. You should see your chat app running!

**Tip:**

- For production, configure authentication (Google SSO, JWT, or user login) and pass your real config object.
- You can wrap your entire app with `XmppProvider` to share a single XMPP connection across all chat features.
- For advanced options and custom UI, see the configuration and styling sections below.

ℹ️ Note: your Ethora App, User and Chat credentials are hard-coded and login screen is bypassed. This is done so that you can scaffold and test the functionality quickly.
Leave this as is if you only need to demo or validate the chat functionality as part of your project.
If you need to have your own private chats, be able to login multiple users etc then go to https://www.ethora.com/, sign up in the top right which gives you a free account with Ethora backend where you can create your own App, manage your Users and Chats, view stats etc. Copy App ID & App Secret to your chat component code which will then switch to your own App context on the server side. The free tier is generous but should you need extra you can later build your own backend, upgrade to a paid tier from Ethora or use a self-hosted AWS marketplace image from Ethora.

## Extra options (styling etc)

You can customize the chat component extensively using the `config` prop and other options. Here are some of the most useful and advanced configuration options:

- **Styling**
  - `colors`: Set primary and secondary theme colors.
  - `roomListStyles`: Custom styles for the room list (left panel).
  - `chatRoomStyles`: Custom styles for the chat area (right panel).
  - `backgroundChat`: Set a background color or image for the chat area.
  - `headerLogo`: Add a custom logo to the chat header.
  - `chatHeaderAdditional`: Add a custom element to the chat header.

- **Room and Navigation**
  - `disableHeader`: Hide the chat header.
  - `disableRooms`: Show only a single room (no room list).
  - `forceSetRoom`: Always show a specific room.
  - `setRoomJidInPath`: Reflect the room JID in the URL for deep linking.
  - `defaultRooms`: Provide a list of default rooms.
  - `disableNewChatButton`: Hide the new chat button.

- **Login and Authentication**
  - `googleLogin`, `jwtLogin`, `userLogin`, `customLogin`: Multiple authentication strategies supported.
  - `defaultLogin`: Use a default demo/test login.

- **Message and Input**
  - `disableMedia`: Disable file/image/audio attachments.
  - `secondarySendButton`: Add a secondary send button (e.g., for message editing or custom actions).
  - `messageTextFilter`: Filter or transform message text before sending.

- **Localization and Translation**
  - `translates`: Enable message translation and localization.

- **Advanced**
  - `enableRoomsRetry`: Enable retry logic and custom helper text if no rooms are available.
  - `botMessageAutoScroll`: Enable auto-scroll for bot messages.
  - `initBeforeLoad`: Initialize XMPP before loading the UI.
  - `refreshTokens`: Enable token refresh logic.

### Example: Customizing the Chat Component

```tsx
import { XmppProvider, Chat } from '@ethora/chat-component';

const config = {
  colors: { primary: '#4287f5', secondary: '#42f5e9' },
  disableHeader: false,
  disableMedia: false,
  roomListStyles: { width: '300px', background: '#f5f5f5' },
  chatRoomStyles: { borderRadius: '16px', border: '1px solid #42f5e9' },
  backgroundChat: { color: '#f0f0f0' },
  headerLogo: '/logo.png',
  chatHeaderAdditional: { enabled: true, element: <MyCustomHeaderElement /> },
  forceSetRoom: false,
  setRoomJidInPath: true,
  disableNewChatButton: false,
  googleLogin: {
    enabled: true,
    firebaseConfig: {
      /* ...firebase config... */
    },
  },
  secondarySendButton: {
    enabled: true,
    messageEdit: ' (edited)',
    label: 'Edit',
    buttonStyles: { background: '#42f5e9', color: '#fff' },
    hideInputSendButton: false,
    overwriteEnterClick: true,
  },
  translates: { enabled: true },
  enableRoomsRetry: {
    enabled: true,
    helperText: 'No rooms found, please try again.',
  },
  botMessageAutoScroll: true,
  messageTextFilter: {
    enabled: true,
    filterFunction: (text) => text.replace(/badword/gi, '***'),
  },
};

<XmppProvider config={config}>
  <Chat
    MainComponentStyles={{
      width: '100%',
      height: '600px',
      borderRadius: '16px',
    }}
    roomJID=""
    user={{ email: '', password: '' }}
    CustomMessageComponent={MyCustomMessage}
  />
</XmppProvider>;
```

- You can also provide a custom message component via the `CustomMessageComponent` prop to fully control the rendering of message bubbles. See [`src/components/ExampleComponents/CustomMessage.tsx`](https://github.com/dappros/ethora-chat-component/blob/main/src/components/ExampleComponents/CustomMessage.tsx) for an example.

- For styling, you can further alter **App.css** and **index.css** as needed.

## Architecture Diagram

![CleanShot 2025-01-09 at 13 14 37@2x](https://github.com/user-attachments/assets/4d187bbb-6697-4e96-97d3-3a4a4b7e8adf)

## Use cases and functionalities details

### LOGIN FUNCTIONALITY

Chat component includes an optional Login / Sign-on screen that allows you to login existing users or sign up new users.
In cases where chat component is embedded into your existing web or app experience, you would likely want to disable and bypass the login screen.

Supported out of the box:

- **Login bypass** (user credentials are passed from your existing backend) ✅
- **E-mail + password** ✅
- **Google SSO** ✅

Supported by Ethora platform but not implemented into Chat Component yet:

- **Custom set of credentials** ✅
- **Apple SSO** 🚧 <sub><sup>(available in [Ethora git repo](https://github.com/dappros/ethora))</sup></sub>
- **Facebook SSO** 🚧 <sub><sup>(available in [Ethora git repo](https://github.com/dappros/ethora))</sup></sub>
- **Metamask SSO** 🚧 <sub><sup>(available in [Ethora git repo](https://github.com/dappros/ethora))</sup></sub>

### CHAT FUNCTIONALITY

#### "One room at a time - chat session"

- Use Case 1: **One global chat room for all users** ✅ - (e.g. chat lobby for all of your website / app users). Simply create a chat room manually and hardcode the UUID into your chat component code.
- Use Case 2: **One chat room per case** ✅ - (e.g. customer support session, AI bot, a chat room for each location or department, web page specific chat etc). You have to create rooms as required by your business logic via Ethora API and then pass the corresponding chat UUID into chat component. Your end User will see the corresponding room.

#### "Multiple rooms - messenger / social app"

- Use Case 3: **Users can switch between Chats** ✅
  Similar to Use Case 2, but also allows your User to switch to the **List of Chats** where they can see chat rooms, the count of new messages and a last message for each room etc. Users can create new Chats and invite others into Chats (depending on your App settings). This functionality is now available in the Chat Component.

#### Misc core chat functionalities

- **Chat header** ✅ - Header with chat title and Users counter (this is optional and you can disable the header)
- **Message bubbles** ✅ - Message bubbles next to user avatars with message content and timestamp
- **Chat history caching and scrolling** ✅
- **Chat history date divider** ✅
- **Now typing** ✅ - when someone is typing, other room Users will see indication of who is typing
- **Threaded replies** ✅ - Users can reply to messages in threads and view full message threads
- **Message translation/multi-language support** ✅ - Built-in support for message translation and language selection
- **Custom message component support** ✅ - Developers can provide a custom React component to fully control the rendering of message bubbles

#### Message interactions

- **Message menu** ✅ - Long tap or right click opens message menu with "Reply", "Copy", "Edit", "Delete", "Report" options available as well as send Coin / Item options
- **Emoji Reactions** ✅ - Users are able to long tap / click on the message and send Emoji reactions to the message. Reactions are displayed in the corner of the message bubble.
- **Reply to message (threaded replies)** ✅
- **Edit message** ✅
- **Delete message** ✅
- **Copy message** ✅

#### Avatars (profile photos)

- **Basic avatars** ✅ - in chat screen, users can see basic avatars next to chat bubbles. Simply default avatar icon for everyone.
- **"Initials" avatars** ✅ - in Chat screen, users who don't have photos uploaded will show as "initials" avatars generated by taking the first letter of User's first name and last name
- **Google SSO avatars** 🚧 <sub><sup>(available in [Ethora git repo](https://github.com/dappros/ethora))</sup></sub> - when using Google SSO, their Google profile photo will be automatically displayed as chat avatar
- **Custom profile photos** ✅ - users are able to upload their custom photos when managing their Profile and the mini-photo will be displayed as a chat avatar

#### Notifications

- **Browser and mobile push notifications** 🚧 <sub><sup>(available in [Ethora git repo](https://github.com/dappros/ethora))</sup></sub> - push notifications are useful to alert the User about new messages or transactions related to them when they are not actively using your app / chat in the browser.

### FILE ATTACHMENTS

- **File attachments** ✅ - file attachments, previews, media attachments, audio/video player etc are implemented in the chat component
- **Image upload and preview** ✅
- **Video upload and playback** ✅
- **Audio message recording and playback** ✅

### USER PROFILES AND DIGITAL WALLET FUNCTIONALITY

- **Profile screen** ✅ - users can see their own and other Users Profile screens by tapping their avatar in Chat. Profile includes Photo, name, description, direct message button and profile share link
- **Profile Assets (Digital Wallet)** 🚧 <sub><sup>(available in [Ethora git repo](https://github.com/dappros/ethora))</sup></sub> - Users can view assets (Documents, art/collectables, Coins) within their own profile or profiles of other Users, depending on App-wide and User-specific visibility settings
- **Profile Asset: Coins** 🚧 <sub><sup>(available in [Ethora git repo](https://github.com/dappros/ethora))</sup></sub> - Coins, Points, Stars (you can call this anything in your project) are a rewards system where Users and Bots can reward individual messages of other Users
- **Profile Asset: Documents** 🚧 <sub><sup>(available in [Ethora git repo](https://github.com/dappros/ethora))</sup></sub> - Documents in Profiles support use cases where certain User (or bot / business page) need to display certain documents and their provenance history. E.g. business / educational / medical certificates, case-related documents, contracts etc.
- **Profile Asset: Media (audio, video) files** 🚧 <sub><sup>(available in [Ethora git repo](https://github.com/dappros/ethora))</sup></sub> - Media files playable right from Profiles.
- **Profile Asset: Digital Art (collectables / NFT)** 🚧 <sub><sup>(available in [Ethora git repo](https://github.com/dappros/ethora))</sup></sub> - For projects which support rewarding Users with unique digital collectables and/or allowing Users to upload/mint, distribute or trade digital art or collectables.

### ADDITIONAL FUNCTIONALITY

- **Room member management (add/remove users)** ✅ - Users can add or remove members from group chats
- **Room creation modal with image upload** ✅ - Users can create new rooms and upload a room image
- **JWT Login** ✅ - Supports JWT-based login via the `jwtLogin` config.
- **Custom Login** ✅ - Supports a fully custom login function via the `customLogin` config.
- **Room List and Chat Room Styling** ✅ - Style the room list and chat area with `roomListStyles` and `chatRoomStyles`.
- **Force Set Room** ✅ - The `forceSetRoom` config can force the component to always show a specific room.
- **Room List in URL** ✅ - The `setRoomJidInPath` config allows the room JID to be reflected in the URL.
- **Secondary Send Button** ✅ - The `secondarySendButton` config allows for a secondary send action (e.g., for message editing).
- **Room Retry Logic** ✅ - The `enableRoomsRetry` config enables retry logic and custom helper text if no rooms are available.
- **Background Customization** ✅ - The `backgroundChat` config allows setting a background color or image for the chat.
- **Translation/Localization** ✅ - The `translates` config enables message translation and localization.
- **Room Creation Control** ✅ - The `disableNewChatButton` config disables the new chat button.
- **Bot Message Auto Scroll** ✅ - The `botMessageAutoScroll` config enables auto-scrolling for bot messages.
- **Message Text Filter** ✅ - The `messageTextFilter` config allows filtering or transforming message text before sending.

## Configuration Reference

Below is a table describing each property of the `IConfig` model (from `src/types/models/config.model.ts`):

| Prop Name                     | Type / Structure                                                                                                                                                    | Description                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `disableHeader`               | `boolean`                                                                                                                                                           | Hide the chat header.                          |
| `disableMedia`                | `boolean`                                                                                                                                                           | Disable media (file/image/audio) attachments.  |
| `colors`                      | `{ primary: string; secondary: string }`                                                                                                                            | Primary/secondary color theme.                 |
| `googleLogin`                 | `{ enabled: boolean; firebaseConfig: FBConfig }`                                                                                                                    | Enable Google SSO and provide Firebase config. |
| `jwtLogin`                    | `{ token: string; enabled: boolean; handleBadlogin?: React.ReactElement }`                                                                                          | Enable JWT login and provide token.            |
| `userLogin`                   | `{ enabled: boolean; user: User \| null }`                                                                                                                          | Enable user login and provide user object.     |
| `customLogin`                 | `{ enabled: boolean; loginFunction: () => Promise<User \| null> }`                                                                                                  | Enable custom login logic.                     |
| `baseUrl`                     | `string`                                                                                                                                                            | Custom API base URL.                           |
| `customAppToken`              | `string`                                                                                                                                                            | Custom app token for API requests.             |
| `xmppSettings`                | `xmppSettingsInterface`                                                                                                                                             | XMPP server settings.                          |
| `disableRooms`                | `boolean`                                                                                                                                                           | Disable room list and force single-room mode.  |
| `defaultLogin`                | `boolean`                                                                                                                                                           | Use default login (for demo/testing).          |
| `disableInteractions`         | `boolean`                                                                                                                                                           | Disable all user interactions.                 |
| `chatHeaderBurgerMenu`        | `boolean`                                                                                                                                                           | Show/hide burger menu in chat header.          |
| `forceSetRoom`                | `boolean`                                                                                                                                                           | Always show a specific room.                   |
| `roomListStyles`              | `React.CSSProperties`                                                                                                                                               | Custom styles for the room list.               |
| `chatRoomStyles`              | `React.CSSProperties`                                                                                                                                               | Custom styles for the chat area.               |
| `setRoomJidInPath`            | `boolean`                                                                                                                                                           | Reflect room JID in the URL.                   |
| `disableRoomMenu`             | `boolean`                                                                                                                                                           | Disable the room menu.                         |
| `defaultRooms`                | `ConfigRoom[]`                                                                                                                                                      | List of default rooms to show.                 |
| `refreshTokens`               | `{ enabled: boolean; refreshFunction?: () => Promise<{ accessToken: string; refreshToken?: string } \| null> }`                                                     | Enable token refresh logic.                    |
| `backgroundChat`              | `{ color?: string; image?: string \| File }`                                                                                                                        | Set chat background color or image.            |
| `bubleMessage`                | `MessageBubble`                                                                                                                                                     | Custom message bubble component.               |
| `headerLogo`                  | `string \| React.ReactElement`                                                                                                                                      | Custom logo for the chat header.               |
| `headerMenu`                  | `() => void`                                                                                                                                                        | Custom function for header menu.               |
| `headerChatMenu`              | `() => void`                                                                                                                                                        | Custom function for chat menu.                 |
| `customRooms`                 | `{ rooms: PartialRoomWithMandatoryKeys[]; disableGetRooms?: boolean; singleRoom: boolean }`                                                                         | Custom room list and options.                  |
| `translates`                  | `{ enabled: boolean; translations?: Iso639_1Codes }`                                                                                                                | Enable translation/localization.               |
| `disableRoomConfig`           | `boolean`                                                                                                                                                           | Disable room configuration.                    |
| `disableProfilesInteractions` | `boolean`                                                                                                                                                           | Disable profile interactions.                  |
| `disableUserCount`            | `boolean`                                                                                                                                                           | Hide user count in the UI.                     |
| `clearStoreBeforeInit`        | `boolean`                                                                                                                                                           | Clear Redux store before initialization.       |
| `disableSentLogic`            | `boolean`                                                                                                                                                           | Disable sent message logic.                    |
| `initBeforeLoad`              | `boolean`                                                                                                                                                           | Initialize XMPP before loading UI.             |
| `newArch`                     | `boolean`                                                                                                                                                           | Use new architecture for room management.      |
| `qrUrl`                       | `string`                                                                                                                                                            | QR code URL for joining rooms.                 |
| `secondarySendButton`         | `{ enabled: boolean; messageEdit: string; label?: React.ReactNode; buttonStyles?: React.CSSProperties; hideInputSendButton?: boolean; overwriteEnterClick?: true }` | Secondary send button config.                  |
| `enableRoomsRetry`            | `{ enabled: boolean; helperText: string }`                                                                                                                          | Enable retry logic for room loading.           |
| `disableNewChatButton`        | `boolean`                                                                                                                                                           | Disable the new chat button.                   |
| `chatHeaderAdditional`        | `{ enabled: boolean; element: any }`                                                                                                                                | Add additional element to chat header.         |
| `botMessageAutoScroll`        | `boolean`                                                                                                                                                           | Enable auto-scroll for bot messages.           |
| `messageTextFilter`           | `{ enabled: boolean; filterFunction: (text: string) => string }`                                                                                                    | Filter/transform message text before sending.  |

## Contacts, Documentation and Technical Support

- Community support forum: https://forum.ethora.com/
- Discord: https://discord.gg/Sm6bAHA3ZC
- Contact Ethora team: https://www.ethora.com/#contact
- Documentation main: https://docs.ethora.com/
- Documentation for Ethora API (Swagger): https://api.ethoradev.com/api-docs
- Documentation on github including chat protocol and bots: https://github.com/dappros/ethora/tree/main/api

## Supported Environments

- Vite (React + TypeScript/JavaScript)
- Create React App
- Next.js (with client-side rendering)
- Electron (desktop apps)
- PWA (Progressive Web Apps)
- Any modern React setup (17+)

## Example Integrations

### 1. With Firebase Google SSO

```tsx
import { XmppProvider, Chat } from '@ethora/chat-component';
import firebaseConfig from './firebase-config';

const config = {
  googleLogin: { enabled: true, firebaseConfig },
  colors: { primary: '#4287f5', secondary: '#42f5e9' },
};

<XmppProvider config={config}>
  <Chat />
</XmppProvider>;
```

### 2. With JWT Authentication

```tsx
const config = {
  jwtLogin: { enabled: true, token: 'YOUR_JWT_TOKEN' },
};
<XmppProvider config={config}>
  <Chat />
</XmppProvider>;
```

### 3. With Custom Login

```tsx
const config = {
  customLogin: {
    enabled: true,
    loginFunction: async () => {
      // Your custom login logic
      return { xmppUsername: '...', xmppPassword: '...' };
    },
  },
};
<XmppProvider config={config}>
  <Chat />
</XmppProvider>;
```

### 4. In a Next.js App (Client Component)

```tsx
'use client';
import { XmppProvider, Chat } from '@ethora/chat-component';
const config = { defaultLogin: true };
export default function Page() {
  return (
    <XmppProvider config={config}>
      <Chat />
    </XmppProvider>
  );
}
```

## More Screenshots & GIFs

![Chat Room Example](https://github.com/dappros/ethora-chat-component/blob/main/img/readme03.png)
![Threaded Replies](https://github.com/dappros/ethora-chat-component/blob/main/img/readme_threaded.gif)
![Custom Message Bubble](https://github.com/dappros/ethora-chat-component/blob/main/img/readme_custom_message.gif)

## Versioning & Upgrade Notes

- Follows [Semantic Versioning](https://semver.org/).
- See [Releases](https://github.com/dappros/ethora-chat-component/releases) for upgrade notes and breaking changes.
- For major upgrades, review the changelog and migration guide.

## Changelog & Release Notes

See [CHANGELOG.md](https://github.com/dappros/ethora-chat-component/blob/main/CHANGELOG.md) or the [GitHub Releases page](https://github.com/dappros/ethora-chat-component/releases) for details on new features, fixes, and improvements.

## Security

We take security seriously:

- All user input is validated and sanitized.
- XSS/CSRF protection is built-in.
- Auth tokens are never stored in plain text.
- Please [report vulnerabilities](https://www.ethora.com/#contact) responsibly.

## Contribution Guidelines

We welcome contributions! Please see our [CONTRIBUTING.md](https://github.com/dappros/ethora-chat-component/blob/main/CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](https://github.com/dappros/ethora-chat-component/blob/main/CODE_OF_CONDUCT.md) for details.

- Open issues or pull requests for bugs, features, or documentation.
- Join our [community forum](https://forum.ethora.com/) to discuss ideas.

## FAQ

**Q: How do I use my own Redux store?**
A: The component expects certain slices (`rooms`, `chatSettingStore`). You can adapt your store or use the provided one for quick start.

**Q: How do I customize the message bubble?**
A: Use the `CustomMessageComponent` prop. See [`src/components/ExampleComponents/CustomMessage.tsx`](https://github.com/dappros/ethora-chat-component/blob/main/src/components/ExampleComponents/CustomMessage.tsx).

**Q: How do I enable push notifications?**
A: This is planned for a future release. For now, you can integrate with your own notification system.

**Q: Can I use this in Electron or a PWA?**
A: Yes! The component works in Electron and PWA environments.

**Q: How do I report a bug or request a feature?**
A: Open an issue on GitHub or contact us via the [community forum](https://forum.ethora.com/).
