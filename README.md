# How to use Ethora Chat Component

1. npm create vite@latest
2. select name of project, select type (react/js)
3. cd project-name
4. npm i
5. npm i projecet-2-ccomp
6. go to file src/App.tsx and replace it with this code

```
import { ChatWrapper as Chat } from "projecet-2-ccomp";
import { store } from "projecet-2-ccomp";
import { Provider } from "react-redux";
import "./App.css";

function App() {
 return (
  <Provider store={store}>
   <Chat MainComponentStyles={{ width: "100%" }} />
  </Provider>
 );
}

export default App;
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
