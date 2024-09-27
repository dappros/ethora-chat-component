import React from "react";
import "./App.css";
import { ReduxWrapper } from "./components/MainComponents/ReduxWrapper";
import { defRoom } from "./api.config";

function App() {
  return (
    <div className="App">
      <ReduxWrapper
        config={{
          disableHeader: true,
          disableMedia: true,
          colors: { primary: "#5E3FDE", secondary: "#E1E4FE" },
          googleLogin: true,
        }}
        room={defRoom}
      />
    </div>
  );
}

export default App;
