# Ethora Chat Component: a single npm for your React chat

## About Chat Component

Ethora Chat Component allows you to build a functioning chat room super quickly.
Sounds simple and is easy to build your app with.
Uses XMPP chat protocol and ejabberd chat server to provide your users with a seamless instant messaging experience. 

Once you need more functionality however you will be pleasantly surprised. Our Ethora platform behind the chat component offers a plethora of functionalities around chat/social, user profiles, digital wallets, business documents exchange, digital collectables, web3 and AI bots. The history behind Chat Component is following. First, we have built a low-code “super app” engine called Ethora: https://github.com/dappros/ethora/ which we used to drastically speed up app development for our clients. Afterwards, we have open-sourced it for the benefit of other developers. Later on, we realized that whilst developers love what Ethora can do, many of them don’t need such a complex engine with all bells and whistles but a steep learning curver. In most cases you’re after a certain functionality (like a simple chat room) and you need it quick.

Enter Ethora Chat Component which allows you to quickly implement your chat room experience!

If / once you need additional functionalities you will have options like: (a) build them yourself on top of chat component; (b) peek into or use code from Ethora open-source monorepo https://github.com/dappros/ethora/ or (c) seek help from Ethora team or other developers at our forum: https://forum.ethora.com/ or Discord server: https://discord.gg/Sm6bAHA3ZC

Note: scroll below for use cases and functionality break down of this Chat Component.


## How to build your chat room in 5 minutes

1. npm create vite@latest
2. specify a name for your project (e.g. "project-name") and select type (react, javascript etc)
3. cd project-name
4. npm i
5. npm i @ethora/chat-component
6. go to file src/App.tsx and replace it with the below code

```
import { Chat } from "@ethora/chat-component";
import "./App.css";

function App() {
 return (
   <Chat />
 );
}

export default App;
```

7. run like this
```
npm run dev
```

8. Open http://localhost:5173/ in your browser


## Extra options (styling etc)

To create custom chat room styles in **App.tsx**:

replace 
```
<Chat />
```

with:

```
<Chat
    config={{
      disableHeader: true,
      disableMedia: true,
      colors: { primary: "#4287f5", secondary: "#42f5e9" },
    }}
    MainComponentStyles={{
      width: "100%",
      height: "500px",
      borderRadius: "16px",
      border: "1px solid #42f5e9",
    }}
  />
```

For styling you can alter **App.css**:

```
#root {
 width: 100%;
 margin: 0 auto;
 text-align: center;
}
```

and **index.css**:

```
body {
 margin: 0;
 display: flex;
 place-items: center;
 min-width: 320px;
 min-height: 100vh;
 width: 100%;
}
```

After these changes you can modify **MainComponentStyles** for your chat.


## Use cases and functionalities details

### LOGIN FUNCTIONALITY

Chat component includes an optional Login / Sign-on screen that allows you to login existing users or sign up new users. 
In cases where chat component is embedded into your existing web or app experience, you would likely want to disable and bypass the login screen.

Supported out of the box:
* Login bypass (user credentials are passed from your existing backend) ✅
* E-mail + password ✅
* Google SSO ✅

Supported by Ethora platform but not implemented into Chat Component yet:
* Custom set of credentials 🚧
* Apple SSO 🚧
* Facebook SSO 🚧 
* Metamask SSO 🚧


### CHAT FUNCTIONALITY

“One room at a time - chat session”
* One global chat room for all users (e.g. chat lobby for all of your website / app users). Simply create a chat room manually and hardcode the UUID into your chat component code.
* One chat room per case (e.g. customer support session, AI bot, a chat room for each location or department, web page specific chat etc). You have to create rooms as required by your business logic via Ethora API and then pass the corresponding chat UUID into chat component. Your end User will see the corresponding room.

“Multiple rooms - messenger / social app”
Similar to the above, but also allows your User to see the List of Chats and switch between Chats. [ This functionality is available in full Ethora app



### MULTIPLE ROOMS





### USER PROFILES AND DIGITAL WALLET FUNCTIONALITY






