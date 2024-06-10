import { Provider } from "react-redux";
import "./App.css";
import { ChatWrapper } from "./components/ChatWrapper";
import { store } from "./roomStore";

function App() {
  return (
    <Provider store={store}>
      <div className="App">
        <ChatWrapper />
      </div>
    </Provider>
  );
}

export default App;
