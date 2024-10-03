# How to use Ethora Chat Component

1. npm create vite@latest
2. select name of project, select type (react/js)
3. cd project-name
4. npm i
5. npm i @ethora/chat-component
6. go to file src/App.tsx and replace it with this code

```

### Creating just chatroom screen
import { Chat } from "@ethora/chat-component";
import "./App.css";

function App() {
 return (
   <Chat />
 );
}

export default App;

use to create custom styles
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

7. run like this

```
npm run dev
```

8. Open http://localhost:5173/ in your browser

## EXTRA OPTIONS

9. for styling you can alter App.css

```
#root {
 width: 100%;
 margin: 0 auto;
 text-align: center;
}
```

and index.css

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

after these changes you can modify
MainComponentStyles for chat
