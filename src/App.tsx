import { Provider } from "react-redux";
import "./App.css";
import { ChatWrapper } from "./components/MainComponents/ChatWrapper";
import { store } from "./roomStore";

function App() {
  return (
    <Provider store={store}>
      <div className="App">
        <ChatWrapper
          token={undefined}
          room={undefined}
          user={undefined}
          loginData={undefined}
        />
      </div>
    </Provider>
  );
}

export default App;
