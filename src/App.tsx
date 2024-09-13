import React from "react";
import "./App.css";
import { ReduxWrapper } from "./components/MainComponents/ReduxWrapper";

function App() {
  return (
    <div className="App">
      <ReduxWrapper config={{ disableHeader: true, disableMedia: true }} />
    </div>
  );
}

export default App;
