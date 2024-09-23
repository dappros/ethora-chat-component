import React from "react";
import "./App.css";
import { ReduxWrapper } from "./components/MainComponents/ReduxWrapper";

function App() {
  return (
    <div className="App">
      <ReduxWrapper
        config={{
          disableHeader: true,
          disableMedia: true,
          colors: { primary: "#5E3FDE", secondary: "#E1E4FE" },
        }}
      />
    </div>
  );
}

export default App;
